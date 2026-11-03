import { describe, expect, it } from "vitest";

import { mapDamageAnalysis } from "../analyze-photo-mapping";
import { ANALYZE_PHOTO_FIXTURE_DAMAGE_FOUND, ANALYZE_PHOTO_FIXTURE_NOT_A_VEHICLE } from "@fixtures/analyze-photo";
import type { DamageAnalysisWire } from "../schemas/damage-analysis";

describe("mapDamageAnalysis", () => {
  it("maps the fixture's normalized boxes to pixels for a portrait photo with no offset or stretch", () => {
    const result = mapDamageAnalysis(ANALYZE_PHOTO_FIXTURE_DAMAGE_FOUND, 1200, 1600, "mock");
    expect(result.items).toHaveLength(2);
    const [first] = result.items;
    expect(first.boxPx).toEqual({
      left: Math.round((360 * 1200) / 1000),
      top: Math.round((620 * 1600) / 1000),
      right: Math.round((700 * 1200) / 1000),
      bottom: Math.round((820 * 1600) / 1000),
    });
  });

  it("maps the same fixture to a landscape photo, scaling independently per axis", () => {
    const result = mapDamageAnalysis(ANALYZE_PHOTO_FIXTURE_DAMAGE_FOUND, 1600, 1200, "mock");
    const [first] = result.items;
    expect(first.boxPx.right).toBeLessThanOrEqual(1600);
    expect(first.boxPx.bottom).toBeLessThanOrEqual(1200);
  });

  it("passes through is_vehicle_photo: false with no items for a non-vehicle photo", () => {
    const result = mapDamageAnalysis(ANALYZE_PHOTO_FIXTURE_NOT_A_VEHICLE, 1000, 1000, "mock");
    expect(result.isVehiclePhoto).toBe(false);
    expect(result.items).toHaveLength(0);
  });

  it("drops boxes under 1% of the grid instead of passing them through", () => {
    const wire: DamageAnalysisWire = {
      is_vehicle_photo: true,
      vehicle_side: "front",
      quality_note: "",
      items: [
        { part: "scuff", damage_type: "scratch", severity: "minor", description: "tiny", box_2d: [500, 500, 505, 520] },
        { part: "dent", damage_type: "dent", severity: "minor", description: "ok", box_2d: [100, 100, 300, 300] },
      ],
    };
    const result = mapDamageAnalysis(wire, 1000, 1000, "mock");
    expect(result.items).toHaveLength(1);
    expect(result.items[0].part).toBe("dent");
  });

  it("caps items at 16 even if the model somehow returns more", () => {
    const items = Array.from({ length: 20 }, (_, i) => ({
      part: `part-${i}`,
      damage_type: "dent" as const,
      severity: "minor" as const,
      description: "d",
      box_2d: [10, 10, 50, 50] as [number, number, number, number],
    }));
    const wire: DamageAnalysisWire = { is_vehicle_photo: true, vehicle_side: "front", quality_note: "", items };
    const result = mapDamageAnalysis(wire, 1000, 1000, "mock");
    expect(result.items).toHaveLength(16);
  });

  it("sorts swapped box corners before converting", () => {
    const wire: DamageAnalysisWire = {
      is_vehicle_photo: true,
      vehicle_side: "front",
      quality_note: "",
      items: [{ part: "p", damage_type: "dent", severity: "minor", description: "d", box_2d: [300, 300, 100, 100] }],
    };
    const result = mapDamageAnalysis(wire, 1000, 1000, "mock");
    expect(result.items[0].boxNorm).toEqual([100, 100, 300, 300]);
  });
});
