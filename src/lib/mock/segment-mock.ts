import { buildInsetBlobPath } from "@/lib/mock/blob-path";
import type { PixelBox } from "@/lib/box-convert";

// Mock /api/segment results, shaped exactly like the real parsed-SAM output
// (SPEC 8.3's "Return to the client per object"), so the Damage review
// screen's canvas overlay renders identically whether or not AJALI_MOCK is
// on. Every svgPath is in mask-RASTER-local coordinates (0,0 at the box's
// own top-left), matching the real decodeMaskToSVGPath output, so the
// client's "translate to box origin, scale by boxW/rasterWidth" transform
// (SPEC 8.3) works unchanged for both mock and real masks.
export interface MockSegmentObject {
  objectId: string;
  box: PixelBox;
  svgPath: string;
  rasterWidth: number;
  rasterHeight: number;
  areaPx: number;
  confidence: number;
}

const VEHICLE_SEED = 7;
const VEHICLE_CONFIDENCE = 0.97;
const DAMAGE_CONFIDENCE = 0.85;

// "car" (or similar) concept prompt: a near-full-frame silhouette, not the
// whole rectangle, standing in for the vehicle outline.
export function buildMockVehicleMask(width: number, height: number): MockSegmentObject {
  const localBox: PixelBox = { left: 0, top: 0, right: width, bottom: height };
  const blob = buildInsetBlobPath(localBox, VEHICLE_SEED, { insetFraction: 0.92, vertexCount: 16, wobble: 0.06 });
  return {
    objectId: "vehicle",
    box: localBox,
    svgPath: blob.svgPath,
    rasterWidth: width,
    rasterHeight: height,
    areaPx: blob.areaPx,
    confidence: VEHICLE_CONFIDENCE,
  };
}

// Box prompts: one inset, wobbly blob per requested object id, sized to look
// like plausible damage inside its own box, not the box itself.
export function buildMockBoxMasks(items: ReadonlyArray<{ id: number; box: PixelBox }>): MockSegmentObject[] {
  return items.map(({ id, box }) => {
    const width = box.right - box.left;
    const height = box.bottom - box.top;
    const localBox: PixelBox = { left: 0, top: 0, right: width, bottom: height };
    const blob = buildInsetBlobPath(localBox, id, { insetFraction: 0.72, vertexCount: 10, wobble: 0.24 });
    return {
      objectId: String(id),
      box,
      svgPath: blob.svgPath,
      rasterWidth: width,
      rasterHeight: height,
      areaPx: blob.areaPx,
      confidence: DAMAGE_CONFIDENCE,
    };
  });
}
