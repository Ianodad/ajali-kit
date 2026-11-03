import { decodeMaskToRaster, decodeMaskToSVGPath, recordsOfKind, type SegmentationRecord } from "@meta-sam/parser";

import type { PixelBox } from "@/lib/box-convert";

// Pairs SAM 3.1 box and mask records by objectId and decodes each mask, per
// SPEC section 8.3 ("Parsing (server side)" and "Return to the client per
// object"). Shared by the real /api/segment path and its unit test; the mock
// path never calls this, since mock masks are synthesized directly.
export interface ParsedSamObject {
  objectId: string;
  box: PixelBox;
  svgPath: string;
  rasterWidth: number;
  rasterHeight: number;
  areaPx: number;
  confidence?: number;
}

export function pairSamRecords(records: readonly SegmentationRecord[]): ParsedSamObject[] {
  const boxes = recordsOfKind(records, "box");
  const masks = recordsOfKind(records, "mask");
  const boxById = new Map(boxes.map((box) => [box.objectId, box]));

  const results: ParsedSamObject[] = [];
  for (const mask of masks) {
    const box = boxById.get(mask.objectId);
    if (!box) continue; // SPEC 8.3: the grammar always pairs one box with one mask; defensive only.

    const raster = decodeMaskToRaster(mask.mask);
    let onesCount = 0;
    for (const bit of raster) onesCount += bit;

    const boxWidthPx = box.right - box.left;
    const boxHeightPx = box.bottom - box.top;
    const rasterArea = mask.mask.width * mask.mask.height;
    // SPEC 8.3: "area: count 1s in raster, scale by (boxW * boxH) / (rasterW * rasterH)
    // to get source pixels."
    const areaPx = rasterArea > 0 ? Math.round(onesCount * ((boxWidthPx * boxHeightPx) / rasterArea)) : 0;

    results.push({
      objectId: mask.objectId,
      box: { left: box.left, top: box.top, right: box.right, bottom: box.bottom },
      svgPath: decodeMaskToSVGPath(mask.mask),
      rasterWidth: mask.mask.width,
      rasterHeight: mask.mask.height,
      areaPx,
      confidence: mask.confidence ?? box.confidence,
    });
  }
  return results;
}
