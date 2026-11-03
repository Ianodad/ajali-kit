import type { PixelBox } from "@/lib/box-convert";

// Builds a plausible mock mask for a box: a closed polygon inset from the
// box's edges with a deterministic wobble, instead of the box's own
// rectangle. Used by the /api/segment mock branch so the demo shows a
// believable damage outline (and vehicle silhouette) on any real photo, with
// no network call. Deterministic in `seed` so mock output, and its tests,
// never flake.
export interface BlobPathResult {
  svgPath: string;
  areaPx: number;
}

export interface BlobPathOptions {
  vertexCount?: number;
  insetFraction?: number; // 0..1, fraction of the half-box the base radius uses
  wobble?: number; // 0..1, how much each vertex's radius varies
}

export function buildInsetBlobPath(box: PixelBox, seed: number, options: BlobPathOptions = {}): BlobPathResult {
  const vertexCount = options.vertexCount ?? 10;
  const insetFraction = options.insetFraction ?? 0.78;
  const wobble = options.wobble ?? 0.22;

  const cx = (box.left + box.right) / 2;
  const cy = (box.top + box.bottom) / 2;
  const baseRx = ((box.right - box.left) / 2) * insetFraction;
  const baseRy = ((box.bottom - box.top) / 2) * insetFraction;

  const points: Array<[number, number]> = [];
  for (let i = 0; i < vertexCount; i += 1) {
    const angle = (i / vertexCount) * Math.PI * 2;
    // Deterministic pseudo-random wobble: a few out-of-phase sine terms seeded
    // by the object, so vertices look organic rather than a perfect ellipse.
    const wobbleX = 1 + wobble * Math.sin(seed * 12.9898 + i * 2.37);
    const wobbleY = 1 + wobble * Math.sin(seed * 7.233 + i * 1.71 + 1.3);
    const x = cx + baseRx * wobbleX * Math.cos(angle);
    const y = cy + baseRy * wobbleY * Math.sin(angle);
    points.push([x, y]);
  }

  const svgPath = `${points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ")} Z`;
  const areaPx = Math.round(polygonArea(points));

  return { svgPath, areaPx };
}

// Shoelace formula, so the reported area always matches the path exactly
// rather than a rough estimate.
function polygonArea(points: Array<[number, number]>): number {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}
