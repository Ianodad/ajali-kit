// Box conversion utilities for SPEC section 8.2 ("Post-processing in code")
// and 8.3 (SAM box prompts need pixel boxes with integer, half-open edges).
// A box_2d from Muse Spark is [x1, y1, x2, y2] on a 0..1000 grid; a PixelBox
// is the same box in source image pixels, half-open on right/bottom (so it
// can be passed straight to @meta-sam/parser's buildObjectPrompt).

export type BoxNorm = [number, number, number, number];

export interface PixelBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const NORM_GRID = 1000;
const MIN_FRACTION = 0.01; // SPEC 8.2: drop boxes smaller than 1% of width/height.
const MIN_PIXEL_SIZE = 4; // floor so a rounded-degenerate box is still usable.

// Clamps each coordinate into 0..1000 and sorts corners so x1<=x2, y1<=y2.
// Model output is expected to already be ordered, but a box with swapped or
// out-of-range corners should not crash the pipeline.
export function clampBoxNorm(box: BoxNorm): BoxNorm {
  const [x1, y1, x2, y2] = box;
  const clamp = (v: number) => Math.min(NORM_GRID, Math.max(0, v));
  const left = clamp(Math.min(x1, x2));
  const right = clamp(Math.max(x1, x2));
  const top = clamp(Math.min(y1, y2));
  const bottom = clamp(Math.max(y1, y2));
  return [left, top, right, bottom];
}

// True when the box's width or height is below 1% of the 0..1000 grid, per
// SPEC 8.2: "drop boxes smaller than 1% of the image width or height."
export function isBoxNormTooSmall(box: BoxNorm, minFraction = MIN_FRACTION): boolean {
  const [x1, y1, x2, y2] = box;
  const minSize = NORM_GRID * minFraction;
  return x2 - x1 < minSize || y2 - y1 < minSize;
}

// Converts a normalized 0..1000 box to source pixels, using the exact width
// and height of the image that was sent (SPEC 8.2). Enforces a minimum pixel
// size by expanding a too-thin box around its own center, clamped back
// inside the image, so a rounded-degenerate box never reaches SAM as empty.
export function boxNormToPixels(box: BoxNorm, width: number, height: number): PixelBox {
  const [x1, y1, x2, y2] = clampBoxNorm(box);
  const toX = (v: number) => Math.round((v * width) / NORM_GRID);
  const toY = (v: number) => Math.round((v * height) / NORM_GRID);

  let left = toX(x1);
  let right = toX(x2);
  let top = toY(y1);
  let bottom = toY(y2);

  [left, right] = expandToMinSize(left, right, width);
  [top, bottom] = expandToMinSize(top, bottom, height);

  return { left, top, right, bottom };
}

function expandToMinSize(start: number, end: number, boundMax: number): [number, number] {
  let a = Math.max(0, Math.min(start, boundMax));
  let b = Math.max(0, Math.min(end, boundMax));
  if (b - a >= MIN_PIXEL_SIZE) return [a, b];
  const center = (a + b) / 2;
  a = Math.max(0, Math.round(center - MIN_PIXEL_SIZE / 2));
  b = Math.min(boundMax, a + MIN_PIXEL_SIZE);
  a = Math.max(0, b - MIN_PIXEL_SIZE);
  return [a, b];
}
