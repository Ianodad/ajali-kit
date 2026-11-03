// Client-side image processing for F3 (capture and preview): read the EXIF
// orientation, draw the photo onto a canvas the right way up, then compress
// to max 1600px on the long side (JPEG quality 0.82) plus a 320px thumbnail.
// Runs entirely in the browser; nothing is uploaded.

export interface ProcessedImage {
  blob: Blob;
  thumbBlob: Blob;
  width: number;
  height: number;
}

const MAX_LONG_SIDE = 1600;
const THUMB_LONG_SIDE = 320;
const JPEG_QUALITY = 0.82;
const THUMB_QUALITY = 0.7;

export async function processImage(file: Blob): Promise<ProcessedImage> {
  const [orientation, img] = await Promise.all([readExifOrientation(file), loadImage(file)]);
  const main = drawOriented(img, orientation, MAX_LONG_SIDE);
  const thumbCanvas = resizeCanvas(main.canvas, THUMB_LONG_SIDE);
  const [blob, thumbBlob] = await Promise.all([
    canvasToBlob(main.canvas, JPEG_QUALITY),
    canvasToBlob(thumbCanvas, THUMB_QUALITY),
  ]);
  return { blob, thumbBlob, width: main.width, height: main.height };
}

async function readExifOrientation(file: Blob): Promise<number> {
  try {
    const buffer = await file.arrayBuffer();
    return parseExifOrientation(buffer);
  } catch {
    return 1;
  }
}

// Reads the EXIF orientation tag (0x0112) out of a JPEG's APP1 segment.
// Returns 1 (no rotation) for anything that is not a well-formed JPEG with
// an EXIF block, rather than throwing: a missing or odd tag should never
// block a capture.
export function parseExifOrientation(buffer: ArrayBuffer): number {
  try {
    const view = new DataView(buffer);
    if (view.getUint16(0, false) !== 0xffd8) return 1;
    let offset = 2;
    while (offset + 4 <= view.byteLength) {
      if (view.getUint8(offset) !== 0xff) break;
      const marker = view.getUint8(offset + 1);
      if (marker === 0xd8 || marker === 0xd9) {
        offset += 2;
        continue;
      }
      const segmentLength = view.getUint16(offset + 2, false);
      if (marker === 0xe1) {
        return readOrientationFromApp1(view, offset + 4) ?? 1;
      }
      offset += 2 + segmentLength;
    }
    return 1;
  } catch {
    return 1;
  }
}

function readOrientationFromApp1(view: DataView, exifStart: number): number | null {
  if (view.getUint32(exifStart, false) !== 0x45786966 || view.getUint16(exifStart + 4, false) !== 0x0000) {
    return null;
  }
  const tiffStart = exifStart + 6;
  const little = view.getUint16(tiffStart, false) === 0x4949;
  const firstIfdOffset = view.getUint32(tiffStart + 4, little);
  const ifdStart = tiffStart + firstIfdOffset;
  const entryCount = view.getUint16(ifdStart, little);
  for (let i = 0; i < entryCount; i++) {
    const entryOffset = ifdStart + 2 + i * 12;
    const tag = view.getUint16(entryOffset, little);
    if (tag === 0x0112) {
      return view.getUint16(entryOffset + 8, little);
    }
  }
  return null;
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image."));
    };
    img.src = url;
  });
}

function drawOriented(img: HTMLImageElement, orientation: number, maxLongSide: number) {
  const sourceWidth = img.naturalWidth || img.width;
  const sourceHeight = img.naturalHeight || img.height;
  const swapped = orientation >= 5 && orientation <= 8;
  const normalWidth = swapped ? sourceHeight : sourceWidth;
  const normalHeight = swapped ? sourceWidth : sourceHeight;
  const scale = Math.min(1, maxLongSide / Math.max(normalWidth, normalHeight));
  const drawnWidth = Math.round(sourceWidth * scale);
  const drawnHeight = Math.round(sourceHeight * scale);
  const width = swapped ? drawnHeight : drawnWidth;
  const height = swapped ? drawnWidth : drawnHeight;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available.");
  applyOrientation(ctx, orientation, drawnWidth, drawnHeight);
  ctx.drawImage(img, 0, 0, drawnWidth, drawnHeight);
  return { canvas, width, height };
}

// Standard EXIF orientation-to-canvas-transform table. `width`/`height` here
// are the dimensions the image is drawn at (before rotation), matching the
// values passed to drawImage.
function applyOrientation(ctx: CanvasRenderingContext2D, orientation: number, width: number, height: number) {
  switch (orientation) {
    case 2:
      ctx.transform(-1, 0, 0, 1, width, 0);
      break;
    case 3:
      ctx.transform(-1, 0, 0, -1, width, height);
      break;
    case 4:
      ctx.transform(1, 0, 0, -1, 0, height);
      break;
    case 5:
      ctx.transform(0, 1, 1, 0, 0, 0);
      break;
    case 6:
      ctx.transform(0, 1, -1, 0, height, 0);
      break;
    case 7:
      ctx.transform(0, -1, -1, 0, height, width);
      break;
    case 8:
      ctx.transform(0, -1, 1, 0, 0, width);
      break;
    default:
      break;
  }
}

function resizeCanvas(source: HTMLCanvasElement, maxLongSide: number): HTMLCanvasElement {
  const scale = Math.min(1, maxLongSide / Math.max(source.width, source.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available.");
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Could not create the image file."));
      },
      "image/jpeg",
      quality,
    );
  });
}
