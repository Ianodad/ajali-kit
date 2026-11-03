import type { PixelBox } from "@/lib/box-convert";

// SPEC 8.3 "Client rendering": translate to the box origin, then scale by
// boxW/rasterWidth and boxH/rasterHeight before drawing the mask's SVG path.
// A mask's raster is not always the same size as the box it was requested on
// (SPEC 8.3's own note), so this scale factor matters: drawing a path with
// no scale stretches or shrinks it whenever the two sizes differ.
export interface MaskTransform {
  translateX: number;
  translateY: number;
  scaleX: number;
  scaleY: number;
}

export function maskTransform(box: PixelBox, rasterWidth?: number, rasterHeight?: number): MaskTransform {
  const boxWidth = box.right - box.left;
  const boxHeight = box.bottom - box.top;
  return {
    translateX: box.left,
    translateY: box.top,
    scaleX: rasterWidth && rasterWidth > 0 ? boxWidth / rasterWidth : 1,
    scaleY: rasterHeight && rasterHeight > 0 ? boxHeight / rasterHeight : 1,
  };
}
