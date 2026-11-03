import { describe, expect, it } from "vitest";

import { buildInsetBlobPath } from "../blob-path";

function parsePathPoints(svgPath: string): Array<[number, number]> {
  return svgPath
    .replace(/Z$/, "")
    .trim()
    .split(/\s+/)
    .map((token) => {
      const [x, y] = token.slice(1).split(",").map(Number);
      return [x, y] as [number, number];
    });
}

describe("buildInsetBlobPath", () => {
  const box = { left: 100, top: 100, right: 300, bottom: 260 }; // 200x160
  const boxArea = (box.right - box.left) * (box.bottom - box.top);

  it("stays inside the box (it is inset, not touching the edges)", () => {
    const { svgPath } = buildInsetBlobPath(box, 1);
    for (const [x, y] of parsePathPoints(svgPath)) {
      expect(x).toBeGreaterThanOrEqual(box.left);
      expect(x).toBeLessThanOrEqual(box.right);
      expect(y).toBeGreaterThanOrEqual(box.top);
      expect(y).toBeLessThanOrEqual(box.bottom);
    }
  });

  it("is not a full rectangle: its area is well under the box area", () => {
    const { areaPx } = buildInsetBlobPath(box, 1);
    expect(areaPx).toBeGreaterThan(0);
    expect(areaPx).toBeLessThan(boxArea * 0.9);
  });

  it("is a genuine polygon, not an ellipse: vertex radii vary with the wobble", () => {
    const { svgPath } = buildInsetBlobPath(box, 1, { wobble: 0.3 });
    const points = parsePathPoints(svgPath);
    const cx = (box.left + box.right) / 2;
    const cy = (box.top + box.bottom) / 2;
    const radii = points.map(([x, y]) => Math.hypot(x - cx, y - cy));
    expect(Math.max(...radii) - Math.min(...radii)).toBeGreaterThan(0);
  });

  it("is deterministic for the same seed", () => {
    const a = buildInsetBlobPath(box, 42);
    const b = buildInsetBlobPath(box, 42);
    expect(a).toEqual(b);
  });

  it("varies with the seed, so different damage items don't look identical", () => {
    const a = buildInsetBlobPath(box, 1);
    const b = buildInsetBlobPath(box, 2);
    expect(a.svgPath).not.toBe(b.svgPath);
  });

  it("scales up toward a near-full silhouette for a vehicle-mask-style call", () => {
    const { areaPx } = buildInsetBlobPath(box, 1, { insetFraction: 0.95, vertexCount: 14, wobble: 0.08 });
    expect(areaPx).toBeGreaterThan(boxArea * 0.5);
  });
});
