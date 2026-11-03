import type { PixelBox } from "@/lib/box-convert";

// Response shape for /api/segment, both modes, SPEC 8.3 "Return to the
// client per object." Shared by the route, the mock branch, and the client
// orchestration/canvas code so there is exactly one object shape everywhere.
export interface SegmentResponseObject {
  objectId: string;
  box: PixelBox;
  svgPath: string;
  rasterWidth: number;
  rasterHeight: number;
  areaPx: number;
  confidence?: number;
}

export interface SegmentResponseData {
  objects: SegmentResponseObject[];
  errors?: string[];
}
