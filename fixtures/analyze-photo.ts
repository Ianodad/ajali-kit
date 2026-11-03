import type { DamageAnalysisWire } from "@/lib/schemas/damage-analysis";

// Mock fixtures for /api/analyze-photo (AJALI_MOCK=1 or x-ajali-mock: 1).
// box_2d stays in the 0..1000 grid, so these items land in a plausible spot
// on the main vehicle regardless of the real photo's aspect ratio: the demo
// looks right on a portrait or landscape test photo alike. The route applies
// the same clamp/drop-tiny/convert-to-pixels pipeline to this fixture as it
// does to a real model response, so the returned boxPx always matches the
// width and height the client actually sent.

// Default scenario: a rear-end collision with two distinct damaged areas,
// matching the demo script (SPEC section 12).
export const ANALYZE_PHOTO_FIXTURE_DAMAGE_FOUND: DamageAnalysisWire = {
  is_vehicle_photo: true,
  vehicle_side: "rear",
  quality_note: "",
  items: [
    {
      part: "rear bumper",
      damage_type: "dent",
      severity: "moderate",
      description: "A moderate dent spans the centre of the rear bumper.",
      box_2d: [360, 620, 700, 820],
    },
    {
      part: "left rear light",
      damage_type: "broken",
      severity: "severe",
      description: "The left rear light cluster is cracked and partly detached.",
      box_2d: [700, 540, 860, 700],
    },
  ],
};

// Edge state (F4): "Muse Spark finds no damage."
export const ANALYZE_PHOTO_FIXTURE_NO_DAMAGE: DamageAnalysisWire = {
  is_vehicle_photo: true,
  vehicle_side: "front",
  quality_note: "",
  items: [],
};

// Edge state (F4): "Image is not a vehicle."
export const ANALYZE_PHOTO_FIXTURE_NOT_A_VEHICLE: DamageAnalysisWire = {
  is_vehicle_photo: false,
  vehicle_side: "unknown",
  quality_note: "",
  items: [],
};

export const ANALYZE_PHOTO_FIXTURE = ANALYZE_PHOTO_FIXTURE_DAMAGE_FOUND;
