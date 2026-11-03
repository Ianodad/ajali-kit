import { describe, expect, it } from "vitest";

import { maskTransform } from "../mask-geometry";

describe("maskTransform", () => {
  it("scales by boxW/rasterWidth and boxH/rasterHeight when the raster is smaller than the box", () => {
    const box = { left: 10, top: 20, right: 110, bottom: 70 }; // 100x50
    const transform = maskTransform(box, 50, 25);
    expect(transform).toEqual({ translateX: 10, translateY: 20, scaleX: 2, scaleY: 2 });
  });

  it("scales down when the raster is larger than the box", () => {
    const box = { left: 0, top: 0, right: 50, bottom: 50 };
    const transform = maskTransform(box, 200, 100);
    expect(transform.scaleX).toBeCloseTo(0.25);
    expect(transform.scaleY).toBeCloseTo(0.5);
  });

  it("falls back to a scale of 1 when the raster size is missing (mock masks, raster == box)", () => {
    const box = { left: 0, top: 0, right: 80, bottom: 40 };
    expect(maskTransform(box)).toEqual({ translateX: 0, translateY: 0, scaleX: 1, scaleY: 1 });
  });

  it("falls back to a scale of 1 for a zero raster dimension instead of dividing by zero", () => {
    const box = { left: 0, top: 0, right: 80, bottom: 40 };
    const transform = maskTransform(box, 0, 0);
    expect(transform.scaleX).toBe(1);
    expect(transform.scaleY).toBe(1);
  });

  it("is a no-op scale when the raster already matches the box (the mock's own case)", () => {
    const box = { left: 5, top: 5, right: 105, bottom: 55 };
    expect(maskTransform(box, 100, 50)).toEqual({ translateX: 5, translateY: 5, scaleX: 1, scaleY: 1 });
  });
});
