import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Photo } from "../types";

const getBlobMock = vi.fn();
vi.mock("../incidents", () => ({ getBlob: getBlobMock }));

const { analyzeDamagePhoto, runDamagePipeline } = await import("../damage-pipeline");

function makePhoto(overrides: Partial<Photo> = {}): Photo {
  return {
    id: "photo-1",
    incidentId: "incident-1",
    category: "own_damage",
    blobId: "blob-1",
    thumbBlobId: "thumb-1",
    width: 1200,
    height: 1600,
    takenAt: "2026-11-01T10:00:00+03:00",
    ...overrides,
  };
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

describe("analyzeDamagePhoto", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    getBlobMock.mockReset();
    getBlobMock.mockResolvedValue({ id: "blob-1", blob: new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }) });
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stops after analyze-photo when the photo is not a vehicle", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: true, data: { model: "mock", isVehiclePhoto: false, vehicleSide: "unknown", qualityNote: "", items: [] } }),
    );
    const analysis = await analyzeDamagePhoto(makePhoto());
    expect(analysis.isVehiclePhoto).toBe(false);
    expect(analysis.items).toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stops after analyze-photo when no damage is found", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: true, data: { model: "mock", isVehiclePhoto: true, vehicleSide: "front", qualityNote: "", items: [] } }),
    );
    const analysis = await analyzeDamagePhoto(makePhoto());
    expect(analysis.isVehiclePhoto).toBe(true);
    expect(analysis.items).toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("runs the concept and box segment calls and assembles confirmed-shape damage items", async () => {
    const analyzeData = {
      model: "mock",
      isVehiclePhoto: true,
      vehicleSide: "rear",
      qualityNote: "",
      items: [
        { part: "bumper", damageType: "dent", severity: "moderate", description: "d1", boxNorm: [0, 0, 100, 100], boxPx: { left: 0, top: 0, right: 100, bottom: 100 } },
        { part: "door", damageType: "scratch", severity: "minor", description: "d2", boxNorm: [200, 200, 300, 300], boxPx: { left: 200, top: 200, right: 300, bottom: 300 } },
      ],
    };
    const vehicleData = { objects: [{ objectId: "vehicle", box: { left: 0, top: 0, right: 1200, bottom: 1600 }, svgPath: "M0,0Z", rasterWidth: 1200, rasterHeight: 1600, areaPx: 1000000 }] };
    const boxesData = {
      objects: [
        // A raster smaller than its own box: the real API does not promise
        // they match (SPEC 8.3). The pipeline must carry both sizes through
        // so the canvas can scale, not just translate.
        { objectId: "1", box: { left: 0, top: 0, right: 100, bottom: 100 }, svgPath: "M1Z", rasterWidth: 50, rasterHeight: 25, areaPx: 5000 },
        { objectId: "2", box: { left: 200, top: 200, right: 300, bottom: 300 }, svgPath: "M2Z", rasterWidth: 100, rasterHeight: 100, areaPx: 3000 },
      ],
    };

    // Both segment calls share a URL, so route by request body mode instead.
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes("analyze-photo")) return Promise.resolve(jsonResponse({ ok: true, data: analyzeData }));
      const body = JSON.parse(String(init?.body));
      if (body.mode === "concept") return Promise.resolve(jsonResponse({ ok: true, data: vehicleData }));
      return Promise.resolve(jsonResponse({ ok: true, data: boxesData }));
    });

    const progress: Array<[string, string]> = [];
    const analysis = await analyzeDamagePhoto(makePhoto(), { onProgress: (id, p) => progress.push([id, p]) });

    expect(analysis.items).toHaveLength(2);
    expect(analysis.vehicleMask?.areaPx).toBe(1000000);
    expect(analysis.items[0].maskSvgPath).toBe("M1Z");
    expect(analysis.items[0].maskRasterWidth).toBe(50);
    expect(analysis.items[0].maskRasterHeight).toBe(25);
    expect(analysis.vehicleMask?.rasterWidth).toBe(1200);
    expect(analysis.vehicleMask?.rasterHeight).toBe(1600);
    expect(analysis.items[0].shareOfVehicle).toBeCloseTo(5000 / 1000000);
    expect(analysis.items[1].samObjectId).toBe(2);
    expect(analysis.items.every((item) => item.status === "pending" && item.source === "ai")).toBe(true);
    expect(progress).toEqual([
      ["photo-1", "finding_damage"],
      ["photo-1", "marking_area"],
      ["photo-1", "done"],
    ]);
  });

  it("keeps damage items with a box outline only when SAM finds no mask for that box", async () => {
    const analyzeData = {
      model: "mock",
      isVehiclePhoto: true,
      vehicleSide: "front",
      qualityNote: "",
      items: [{ part: "bonnet", damageType: "dent", severity: "minor", description: "d", boxNorm: [0, 0, 10, 10], boxPx: { left: 0, top: 0, right: 10, bottom: 10 } }],
    };
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes("analyze-photo")) return Promise.resolve(jsonResponse({ ok: true, data: analyzeData }));
      const body = JSON.parse(String(init?.body));
      if (body.mode === "concept") return Promise.resolve(jsonResponse({ ok: true, data: { objects: [] } }));
      return Promise.resolve(jsonResponse({ ok: true, data: { objects: [] } })); // zero matches for the box
    });

    const analysis = await analyzeDamagePhoto(makePhoto());
    expect(analysis.items).toHaveLength(1);
    expect(analysis.items[0].maskSvgPath).toBeUndefined();
    expect(analysis.items[0].boxPx).toEqual({ left: 0, top: 0, right: 10, bottom: 10 });
    expect(analysis.vehicleMask).toBeUndefined();
  });

  it("degrades to no vehicle mask, without failing, when the concept call errors", async () => {
    const analyzeData = {
      model: "mock",
      isVehiclePhoto: true,
      vehicleSide: "front",
      qualityNote: "",
      items: [{ part: "bonnet", damageType: "dent", severity: "minor", description: "d", boxNorm: [0, 0, 10, 10], boxPx: { left: 0, top: 0, right: 10, bottom: 10 } }],
    };
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes("analyze-photo")) return Promise.resolve(jsonResponse({ ok: true, data: analyzeData }));
      const body = JSON.parse(String(init?.body));
      if (body.mode === "concept") return Promise.resolve(jsonResponse({ ok: false, error: { code: "model_error", message: "no car", retryable: false } }));
      return Promise.resolve(jsonResponse({ ok: true, data: { objects: [{ objectId: "1", box: body.items[0].box, svgPath: "M3Z", rasterWidth: 10, rasterHeight: 10, areaPx: 50 }] } }));
    });

    const analysis = await analyzeDamagePhoto(makePhoto());
    expect(analysis.vehicleMask).toBeUndefined();
    expect(analysis.items[0].maskSvgPath).toBe("M3Z");
    expect(analysis.items[0].shareOfVehicle).toBeUndefined();
    expect(analysis.errors?.length).toBeGreaterThan(0);
  });

  it("throws when the box-masks call fails", async () => {
    const analyzeData = {
      model: "mock",
      isVehiclePhoto: true,
      vehicleSide: "front",
      qualityNote: "",
      items: [{ part: "bonnet", damageType: "dent", severity: "minor", description: "d", boxNorm: [0, 0, 10, 10], boxPx: { left: 0, top: 0, right: 10, bottom: 10 } }],
    };
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes("analyze-photo")) return Promise.resolve(jsonResponse({ ok: true, data: analyzeData }));
      const body = JSON.parse(String(init?.body));
      if (body.mode === "concept") return Promise.resolve(jsonResponse({ ok: true, data: { objects: [] } }));
      return Promise.resolve(jsonResponse({ ok: false, error: { code: "model_error", message: "segment failed", retryable: true } }));
    });

    await expect(analyzeDamagePhoto(makePhoto())).rejects.toThrow("segment failed");
  });

  it("surfaces an offline-style message when fetch itself throws", async () => {
    fetchMock.mockRejectedValue(new TypeError("network error"));
    await expect(analyzeDamagePhoto(makePhoto())).rejects.toThrow(/internet/i);
  });
});

describe("runDamagePipeline", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    getBlobMock.mockReset();
    getBlobMock.mockResolvedValue({ id: "blob-1", blob: new Blob([new Uint8Array([1])], { type: "image/jpeg" }) });
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("isolates one photo's failure from the rest", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      if (url.includes("analyze-photo") && body.width === 1) {
        return Promise.resolve(jsonResponse({ ok: false, error: { code: "model_error", message: "boom", retryable: false } }));
      }
      return Promise.resolve(jsonResponse({ ok: true, data: { model: "mock", isVehiclePhoto: true, vehicleSide: "front", qualityNote: "", items: [] } }));
    });

    const photos = [makePhoto({ id: "a", width: 1 }), makePhoto({ id: "b", width: 2 })];
    const results = await runDamagePipeline(photos);
    expect(results.find((r) => r.photoId === "a")?.error).toBe("boom");
    expect(results.find((r) => r.photoId === "b")?.analysis?.isVehiclePhoto).toBe(true);
  });
});
