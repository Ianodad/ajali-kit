import { drawDamageOverlay, type DamageOverlayItem } from "./draw-damage-overlay";
import { getBlob } from "./incidents";
import type { DamageAnalysis } from "./types";

// SPEC F9 edge state: "Large pack (more than 20 photos): photos are
// downscaled to 1200px in the PDF." Pass Infinity to keep the photo at its
// already-compressed size (image.ts caps capture at 1600px long side).
export const PDF_LARGE_PACK_MAX_DIMENSION = 1200;
export const PDF_PHOTO_COUNT_THRESHOLD = 20;

export interface FlattenedPhoto {
  dataUrl: string;
  width: number;
  height: number;
}

export interface FlattenedDamagePhoto {
  original: FlattenedPhoto;
  overlay: FlattenedPhoto;
}

export function scaledSize(width: number, height: number, maxDimension: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxDimension) return { width, height };
  const scale = maxDimension / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

async function loadImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Could not load photo"));
      image.src = url;
    });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function makeCanvasContext(width: number, height: number): CanvasRenderingContext2D {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  return ctx;
}

// Flattens a scene/plate/other-vehicle photo (no overlay) to a PNG data URL,
// for the PDF's "Other photos" section (SPEC F9 item 7).
export async function flattenPhoto(blobId: string, width: number, height: number, maxDimension: number): Promise<FlattenedPhoto> {
  const stored = await getBlob(blobId);
  if (!stored) throw new Error("Photo not found");
  const image = await loadImage(stored.blob);
  const { width: outW, height: outH } = scaledSize(width, height, maxDimension);
  const ctx = makeCanvasContext(outW, outH);
  ctx.drawImage(image, 0, 0, outW, outH);
  return { dataUrl: ctx.canvas.toDataURL("image/png"), width: outW, height: outH };
}

// Flattens a damage photo plus its masks and numbered pins to two PNGs (the
// annotated version and the plain original), using the exact same drawing
// code as the S11 review canvas (SPEC F9 item 6, A9: "annotated photos match
// the on-screen overlays").
export async function flattenDamagePhoto(
  blobId: string,
  width: number,
  height: number,
  maxDimension: number,
  vehicleMask: DamageAnalysis["vehicleMask"] | undefined,
  overlayItems: DamageOverlayItem[],
): Promise<FlattenedDamagePhoto> {
  const stored = await getBlob(blobId);
  if (!stored) throw new Error("Photo not found");
  const image = await loadImage(stored.blob);
  const { width: outW, height: outH } = scaledSize(width, height, maxDimension);

  const originalCtx = makeCanvasContext(outW, outH);
  originalCtx.drawImage(image, 0, 0, outW, outH);

  const overlayCtx = makeCanvasContext(outW, outH);
  overlayCtx.scale(outW / width, outH / height);
  drawDamageOverlay(overlayCtx, image, width, height, vehicleMask, overlayItems, true);

  return {
    original: { dataUrl: originalCtx.canvas.toDataURL("image/png"), width: outW, height: outH },
    overlay: { dataUrl: overlayCtx.canvas.toDataURL("image/png"), width: outW, height: outH },
  };
}
