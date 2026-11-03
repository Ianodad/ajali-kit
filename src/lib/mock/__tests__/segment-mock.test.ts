import { describe, expect, it } from "vitest";

import { buildMockBoxMasks, buildMockVehicleMask } from "../segment-mock";

describe("buildMockVehicleMask", () => {
  it("covers most, but not all, of the frame", () => {
    const vehicle = buildMockVehicleMask(1200, 1600);
    const frameArea = 1200 * 1600;
    expect(vehicle.areaPx).toBeGreaterThan(frameArea * 0.5);
    expect(vehicle.areaPx).toBeLessThan(frameArea);
    expect(vehicle.rasterWidth).toBe(1200);
    expect(vehicle.rasterHeight).toBe(1600);
  });

  it("is geometry-consistent across aspect ratios: it never exceeds the frame box", () => {
    const portrait = buildMockVehicleMask(900, 1600);
    const landscape = buildMockVehicleMask(1600, 900);
    expect(portrait.box).toEqual({ left: 0, top: 0, right: 900, bottom: 1600 });
    expect(landscape.box).toEqual({ left: 0, top: 0, right: 1600, bottom: 900 });
  });
});

describe("buildMockBoxMasks", () => {
  it("returns one object per requested box, each inset and raster-local to its own box", () => {
    const items = [
      { id: 1, box: { left: 360, top: 620, right: 700, bottom: 820 } },
      { id: 2, box: { left: 700, top: 540, right: 860, bottom: 700 } },
    ];
    const masks = buildMockBoxMasks(items);
    expect(masks.map((m) => m.objectId)).toEqual(["1", "2"]);
    for (const [index, mask] of masks.entries()) {
      const { box } = items[index];
      expect(mask.box).toEqual(box);
      expect(mask.rasterWidth).toBe(box.right - box.left);
      expect(mask.rasterHeight).toBe(box.bottom - box.top);
      const boxArea = (box.right - box.left) * (box.bottom - box.top);
      expect(mask.areaPx).toBeGreaterThan(0);
      expect(mask.areaPx).toBeLessThan(boxArea);
    }
  });

  it("gives different ids different-looking blobs, not copies of the same shape", () => {
    const items = [
      { id: 1, box: { left: 0, top: 0, right: 100, bottom: 100 } },
      { id: 2, box: { left: 0, top: 0, right: 100, bottom: 100 } },
    ];
    const [a, b] = buildMockBoxMasks(items);
    expect(a.svgPath).not.toBe(b.svgPath);
  });

  it("handles up to 16 items", () => {
    const items = Array.from({ length: 16 }, (_, i) => ({
      id: i + 1,
      box: { left: 0, top: 0, right: 50, bottom: 50 },
    }));
    expect(buildMockBoxMasks(items)).toHaveLength(16);
  });
});
