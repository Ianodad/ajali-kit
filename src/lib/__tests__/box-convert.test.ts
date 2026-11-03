import { describe, expect, it } from "vitest";

import { boxNormToPixels, clampBoxNorm, isBoxNormTooSmall } from "../box-convert";

describe("clampBoxNorm", () => {
  it("leaves an already-ordered, in-range box unchanged", () => {
    expect(clampBoxNorm([100, 200, 300, 400])).toEqual([100, 200, 300, 400]);
  });

  it("sorts swapped corners", () => {
    expect(clampBoxNorm([300, 400, 100, 200])).toEqual([100, 200, 300, 400]);
  });

  it("clamps out-of-range coordinates into 0..1000", () => {
    expect(clampBoxNorm([-50, -10, 1200, 1500])).toEqual([0, 0, 1000, 1000]);
  });
});

describe("isBoxNormTooSmall", () => {
  it("flags a box under 1% of the grid in width", () => {
    expect(isBoxNormTooSmall([100, 100, 105, 300])).toBe(true);
  });

  it("flags a box under 1% of the grid in height", () => {
    expect(isBoxNormTooSmall([100, 100, 300, 105])).toBe(true);
  });

  it("does not flag a box at or above 1% in both dimensions", () => {
    expect(isBoxNormTooSmall([100, 100, 200, 200])).toBe(false);
  });
});

describe("boxNormToPixels", () => {
  it("scales a centered box to a portrait photo", () => {
    const box = boxNormToPixels([250, 250, 750, 750], 900, 1600);
    expect(box).toEqual({ left: 225, top: 400, right: 675, bottom: 1200 });
  });

  it("scales the same normalized box to a landscape photo with no offset or stretch", () => {
    const box = boxNormToPixels([0, 0, 1000, 1000], 1600, 900);
    expect(box).toEqual({ left: 0, top: 0, right: 1600, bottom: 900 });
  });

  it("expands a rounded-degenerate box to a minimum pixel size instead of collapsing to zero", () => {
    const box = boxNormToPixels([500, 500, 501, 501], 1000, 1000);
    expect(box.right - box.left).toBeGreaterThanOrEqual(4);
    expect(box.bottom - box.top).toBeGreaterThanOrEqual(4);
  });

  it("clamps the expanded minimum size to stay inside the image at the edge", () => {
    const box = boxNormToPixels([0, 0, 1, 1], 1000, 1000);
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.top).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(1000);
    expect(box.bottom).toBeLessThanOrEqual(1000);
    expect(box.right - box.left).toBeGreaterThanOrEqual(4);
  });

  it("sorts and clamps before converting", () => {
    const box = boxNormToPixels([750, 750, 250, 250], 1000, 1000);
    expect(box).toEqual({ left: 250, top: 250, right: 750, bottom: 750 });
  });
});
