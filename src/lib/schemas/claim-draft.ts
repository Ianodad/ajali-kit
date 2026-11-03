import { z } from "zod";

import { ClaimSummarySchema } from "@/lib/claim-summary";

// SPEC section 8.5: prompt, JSON schema and the request/wire contracts for
// the Muse Spark claim draft call. Kept in one module so the route, the mock
// fixture and (later) a smoke script share exactly the same contract, same
// approach as damage-analysis.ts and document-extract.ts.

export const DRAFT_CLAIM_INSTRUCTIONS = `You help a driver in Kenya write a clear motor insurance claim account.
Rules:
1. Use only facts in the provided data. Never add facts, speeds, directions or admissions that are not there.
2. Write in the first person, plain English, short sentences, past tense, in time order.
3. Do not say who was at fault. Describe what happened.
4. damage_schedule: list each confirmed damage item, grouped by vehicle, with photo references.
5. missing_items: list documents or details an insurer usually asks for that are missing from the data
   (for example police OB number, police abstract, other party insurance details, driving licence copy,
   logbook copy, repair estimate). Explain why in one short line each.
6. consistency_warnings: point out contradictions between the driver's words and the evidence
   (for example the driver says they were hit from behind but all damage is on the front).
   Only real contradictions; return an empty list if none.
7. questions_for_user: up to 3 short questions for missing facts that matter.
Never estimate a repair cost and never decide who was at fault.`;

export const DRAFT_CLAIM_USER_TEXT = "Write the claim account from this incident summary.";

export const CLAIM_DRAFT_VEHICLES = ["own", "other"] as const;
export const CLAIM_DRAFT_WARNING_SECTIONS = ["photos", "account", "other_party", "police", "witnesses"] as const;

// Mirrors the json_schema implied by SPEC 8.5 / the ClaimDraft type in
// section 7 exactly (snake_case on the wire).
export const CLAIM_DRAFT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["account", "damage_schedule", "missing_items", "consistency_warnings", "questions_for_user"],
  properties: {
    account: { type: "string" },
    damage_schedule: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["vehicle", "part", "damage", "photo_refs"],
        properties: {
          vehicle: { type: "string", enum: CLAIM_DRAFT_VEHICLES },
          part: { type: "string" },
          damage: { type: "string" },
          photo_refs: { type: "array", items: { type: "string" } },
        },
      },
    },
    missing_items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["item", "why"],
        properties: {
          item: { type: "string" },
          why: { type: "string" },
        },
      },
    },
    consistency_warnings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["warning", "section"],
        properties: {
          warning: { type: "string" },
          section: { type: "string", enum: CLAIM_DRAFT_WARNING_SECTIONS },
        },
      },
    },
    questions_for_user: { type: "array", items: { type: "string" }, maxItems: 3 },
  },
} as const;

export const ClaimDraftScheduleItemWireSchema = z.object({
  vehicle: z.enum(CLAIM_DRAFT_VEHICLES),
  part: z.string(),
  damage: z.string(),
  photo_refs: z.array(z.string()),
});

export const ClaimDraftMissingItemWireSchema = z.object({
  item: z.string(),
  why: z.string(),
});

export const ClaimDraftWarningWireSchema = z.object({
  warning: z.string(),
  section: z.enum(CLAIM_DRAFT_WARNING_SECTIONS),
});

export const ClaimDraftWireSchema = z.object({
  account: z.string(),
  damage_schedule: z.array(ClaimDraftScheduleItemWireSchema),
  missing_items: z.array(ClaimDraftMissingItemWireSchema),
  consistency_warnings: z.array(ClaimDraftWarningWireSchema),
  questions_for_user: z.array(z.string()),
});

export type ClaimDraftWire = z.infer<typeof ClaimDraftWireSchema>;

export const DraftClaimRequestSchema = ClaimSummarySchema;

export type DraftClaimRequest = z.infer<typeof DraftClaimRequestSchema>;
