// Client-side image processing for F3 (capture and preview): draw the photo
// onto a canvas, compress to max 1600px on the long side (JPEG quality
// 0.82), a 320px thumbnail, and a local, non-blocking quality check for very
// dark or very small photos. Runs entirely in the browser; nothing is
// uploaded.
//
// No manual EXIF-orientation transform here: evergreen browsers (Chrome,
// Firefox, Safari) already decode HTMLImageElement pixel data with
// orientation "from-image", so img.naturalWidth/naturalHeight and drawImage
// output are already upright. Re-applying the EXIF orientation matrix on
// top of that double-rotates or mirrors the photo.

export interface ProcessedImage {
  blob: Blob;
  thumbBlob: Blob;
  width: number;
  height: number;
  looksTooDark: boolean;
  looksTooSmall: boolean;
}

const MAX_LONG_SIDE = 1600;
const THUMB_LONG_SIDE = 320;
const JPEG_QUALITY = 0.82;
const THUMB_QUALITY = 0.7;
const MIN_USABLE_LONG_SIDE = 400;
const DARK_MEAN_LUMINANCE = 40; // 0..255, roughly "mostly black"

export async function processImage(file: Blob): Promise<ProcessedImage> {
  const img = await loadImage(file);
  const main = drawScaled(img, MAX_LONG_SIDE);
  const thumbCanvas = resizeCanvas(main.canvas, THUMB_LONG_SIDE);
  const [blob, thumbBlob] = await Promise.all([
    canvasToBlob(main.canvas, JPEG_QUALITY),
    canvasToBlob(thumbCanvas, THUMB_QUALITY),
  ]);
  return {
    blob,
    thumbBlob,
    width: main.width,
    height: main.height,
    looksTooDark: meanLuminance(thumbCanvas) < DARK_MEAN_LUMINANCE,
    looksTooSmall: Math.max(main.width, main.height) < MIN_USABLE_LONG_SIDE,
  };
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

function drawScaled(img: HTMLImageElement, maxLongSide: number) {
  const sourceWidth = img.naturalWidth || img.width;
  const sourceHeight = img.naturalHeight || img.height;
  const scale = Math.min(1, maxLongSide / Math.max(sourceWidth, sourceHeight));
  const width = Math.round(sourceWidth * scale);
  const height = Math.round(sourceHeight * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available.");
  ctx.drawImage(img, 0, 0, width, height);
  return { canvas, width, height };
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

// Mean perceptual luminance (0..255) over the thumbnail, the cheapest canvas
// to read back. Falls back to "not dark" (255) if pixel data is unavailable.
function meanLuminance(canvas: HTMLCanvasElement): number {
  const ctx = canvas.getContext("2d");
  if (!ctx || canvas.width === 0 || canvas.height === 0) return 255;
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let total = 0;
  let count = 0;
  for (let i = 0; i < data.length; i += 4) {
    total += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    count += 1;
  }
  return count > 0 ? total / count : 255;
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
