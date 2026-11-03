import { boxNormToPixels, clampBoxNorm, isBoxNormTooSmall, type PixelBox } from "@/lib/box-convert";
import type { DamageAnalysisWire } from "@/lib/schemas/damage-analysis";
import type { DamageType, Severity } from "@/lib/types";

// SPEC 8.2 post-processing, shared by the real path and the mock fixture so
// both go through the exact same clamp / drop-tiny / convert-to-pixels /
// cap-16 pipeline, and the mock's boxPx always matches the photo actually
// sent.

const MAX_ITEMS = 16; // SAM box prompt limit (SPEC 8.2, 8.3).

export interface AnalyzedDamageItem {
  part: string;
  damageType: DamageType;
  severity: Severity;
  description: string;
  boxNorm: [number, number, number, number];
  boxPx: PixelBox;
}

export interface AnalyzePhotoData {
  model: string;
  isVehiclePhoto: boolean;
  vehicleSide: DamageAnalysisWire["vehicle_side"];
  qualityNote: string;
  items: AnalyzedDamageItem[];
}

export function mapDamageAnalysis(
  wire: DamageAnalysisWire,
  width: number,
  height: number,
  model: string,
): AnalyzePhotoData {
  const items: AnalyzedDamageItem[] = wire.items
    .map((item) => clampBoxNorm(item.box_2d))
    .map((boxNorm, index) => ({ boxNorm, item: wire.items[index] }))
    .filter(({ boxNorm }) => !isBoxNormTooSmall(boxNorm))
    .slice(0, MAX_ITEMS)
    .map(({ boxNorm, item }) => ({
      part: item.part,
      damageType: item.damage_type,
      severity: item.severity,
      description: item.description,
      boxNorm,
      boxPx: boxNormToPixels(boxNorm, width, height),
    }));

  return {
    model,
    isVehiclePhoto: wire.is_vehicle_photo,
    vehicleSide: wire.vehicle_side,
    qualityNote: wire.quality_note,
    items,
  };
}
