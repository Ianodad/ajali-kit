import { z } from "zod";

import type { DamageType, Severity } from "@/lib/types";

// SPEC section 8.2: prompt, JSON schema and post-processing for the Muse
// Spark damage analysis call. Kept in one module so the route, the mock
// fixture and the smoke script share exactly the same contract.

export const DAMAGE_INSTRUCTIONS = `You are a careful motor vehicle damage spotter helping a driver in Kenya prepare an insurance claim.
Look only at what is visible in the photo. Do not guess hidden damage. Do not estimate repair costs.
Do not decide who was at fault.
For each distinct damaged area on the main vehicle in the photo, return:
- part: the car part in plain English (e.g. "rear bumper", "left front door", "right headlight").
- damage_type: one of the allowed values.
- severity: minor, moderate or severe. This is indicative only.
- description: one short factual sentence.
- box_2d: [x1, y1, x2, y2] tight around the damaged area, on a 0 to 1000 grid where (0,0) is top-left
  and (1000,1000) is bottom-right of the image you received.
Return at most 12 items. If two areas touch on the same part, return one item.
If the photo is not of a vehicle, set is_vehicle_photo to false and return no items.
If the photo is too dark, blurry or far away to judge, say so in quality_note.`;

export const DAMAGE_ANALYSIS_USER_TEXT = "Find the visible damage on the main vehicle in this photo.";

export const DAMAGE_TYPES = [
  "dent",
  "scratch",
  "crack",
  "broken",
  "missing_part",
  "deformation",
  "paint_damage",
  "glass_damage",
  "other",
] as const satisfies readonly DamageType[];

export const SEVERITIES = ["minor", "moderate", "severe"] as const satisfies readonly Severity[];

export const VEHICLE_SIDES = [
  "front",
  "rear",
  "left",
  "right",
  "front_left",
  "front_right",
  "rear_left",
  "rear_right",
  "top",
  "unknown",
] as const;

// Mirrors the json_schema in SPEC 8.2 exactly (snake_case on the wire).
export const DAMAGE_ANALYSIS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["is_vehicle_photo", "vehicle_side", "quality_note", "items"],
  properties: {
    is_vehicle_photo: { type: "boolean" },
    vehicle_side: { type: "string", enum: VEHICLE_SIDES },
    quality_note: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["part", "damage_type", "severity", "description", "box_2d"],
        properties: {
          part: { type: "string" },
          damage_type: { type: "string", enum: DAMAGE_TYPES },
          severity: { type: "string", enum: SEVERITIES },
          description: { type: "string" },
          box_2d: { type: "array", items: { type: "integer", minimum: 0, maximum: 1000 }, minItems: 4, maxItems: 4 },
        },
      },
    },
  },
} as const;

const Box2dSchema = z.tuple([
  z.number().int().min(0).max(1000),
  z.number().int().min(0).max(1000),
  z.number().int().min(0).max(1000),
  z.number().int().min(0).max(1000),
]);

export const DamageAnalysisItemWireSchema = z.object({
  part: z.string(),
  damage_type: z.enum(DAMAGE_TYPES),
  severity: z.enum(SEVERITIES),
  description: z.string(),
  box_2d: Box2dSchema,
});

export const DamageAnalysisWireSchema = z.object({
  is_vehicle_photo: z.boolean(),
  vehicle_side: z.enum(VEHICLE_SIDES),
  quality_note: z.string(),
  items: z.array(DamageAnalysisItemWireSchema),
});

export type DamageAnalysisWire = z.infer<typeof DamageAnalysisWireSchema>;
export type DamageAnalysisItemWire = z.infer<typeof DamageAnalysisItemWireSchema>;

// Request body the client sends to /api/analyze-photo. The exact pixel size
// of the image sent is required for the server's box_2d -> pixel conversion
// (SPEC 8.2 post-processing), since it must match "the exact size of the
// image sent", not any later-resized copy.
export const AnalyzePhotoRequestSchema = z.object({
  imageDataUrl: z.string().startsWith("data:image/"),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export type AnalyzePhotoRequest = z.infer<typeof AnalyzePhotoRequestSchema>;
