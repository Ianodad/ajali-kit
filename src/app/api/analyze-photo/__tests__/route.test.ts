import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// route.ts imports "@/lib/meta", which is a server-only module. Replace it
// wholesale so tests never touch the real OpenAI client, the same approach
// as meta.test.ts uses for "server-only" itself.
const createMock = vi.fn();
vi.mock("@/lib/meta", () => ({
  getMetaClient: () => ({ responses: { create: createMock } }),
  MUSE_MODEL: "muse-spark-1.3",
}));

const { POST } = await import("../route");

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/analyze-photo", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const validBody = { imageDataUrl: "data:image/jpeg;base64,abcd", width: 1200, height: 1600 };

describe("POST /api/analyze-photo", () => {
  const originalMock = process.env.AJALI_MOCK;

  beforeEach(() => {
    createMock.mockReset();
    delete process.env.AJALI_MOCK;
  });

  afterEach(() => {
    if (originalMock === undefined) delete process.env.AJALI_MOCK;
    else process.env.AJALI_MOCK = originalMock;
    vi.useRealTimers();
  });

  it("rejects a malformed request body with ok:false, before touching the model", async () => {
    const res = await POST(request({ width: 100 }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns the mock fixture, mapped to the sent photo's pixels, via the mock header with no model call", async () => {
    const res = await POST(request(validBody, { "x-ajali-mock": "1" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.isVehiclePhoto).toBe(true);
    expect(json.data.items.length).toBeGreaterThan(0);
    for (const item of json.data.items) {
      expect(item.boxPx.right).toBeLessThanOrEqual(validBody.width);
      expect(item.boxPx.bottom).toBeLessThanOrEqual(validBody.height);
    }
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns the mock fixture via AJALI_MOCK=1 with no header", async () => {
    process.env.AJALI_MOCK = "1";
    const res = await POST(request(validBody));
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("parses a real structured-output response into the mapped shape", async () => {
    createMock.mockResolvedValue({
      output_text: JSON.stringify({
        is_vehicle_photo: true,
        vehicle_side: "front",
        quality_note: "",
        items: [{ part: "bonnet", damage_type: "dent", severity: "minor", description: "d", box_2d: [10, 10, 100, 100] }],
      }),
      usage: { input_tokens: 10, output_tokens: 5 },
    });
    const res = await POST(request(validBody));
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.items).toHaveLength(1);
    expect(json.data.items[0].part).toBe("bonnet");
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("retries once on an invalid JSON response, then succeeds", async () => {
    vi.useFakeTimers();
    createMock
      .mockResolvedValueOnce({ output_text: "not json", usage: {} })
      .mockResolvedValueOnce({
        output_text: JSON.stringify({ is_vehicle_photo: false, vehicle_side: "unknown", quality_note: "", items: [] }),
        usage: {},
      });
    const resPromise = POST(request(validBody));
    await vi.advanceTimersByTimeAsync(5000);
    const res = await resPromise;
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.isVehiclePhoto).toBe(false);
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after repeated schema-invalid responses and returns ok:false", async () => {
    vi.useFakeTimers();
    createMock.mockResolvedValue({ output_text: JSON.stringify({ not: "the expected shape" }), usage: {} });
    const resPromise = POST(request(validBody));
    await vi.advanceTimersByTimeAsync(30000);
    const res = await resPromise;
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(createMock).toHaveBeenCalledTimes(4); // 1 try + 3 retries, per SPEC 8.1
  });
});
