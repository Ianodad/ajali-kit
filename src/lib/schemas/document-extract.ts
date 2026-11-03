import { z } from "zod";

import type { DocType } from "@/lib/types";

// SPEC section 8.4: prompt, JSON schema and the field-key enum for the Muse
// Spark document extraction call. Kept in one module so the route, the mock
// fixtures and (later) a smoke script share exactly the same contract.

export const DOC_TYPES = [
  "driving_licence",
  "logbook",
  "insurance_certificate",
  "police_abstract",
  "national_id",
  "other",
] as const satisfies readonly DocType[];

export const FIELD_KEYS = [
  "full_name",
  "id_number",
  "licence_number",
  "licence_expiry",
  "registration",
  "make",
  "model",
  "colour",
  "owner_name",
  "chassis_number",
  "insurer",
  "policy_or_certificate_number",
  "cover_start",
  "cover_expiry",
  "ob_number",
  "police_station",
] as const;

export type FieldKey = (typeof FIELD_KEYS)[number];

export const CONFIDENCES = ["high", "medium", "low"] as const;

export function buildDocumentInstructions(docType: DocType): string {
  return `You read Kenyan vehicle and driver documents from a photo for an insurance claim form.
The document type the user selected is: ${docType}.
Copy text exactly as printed. Do not guess. If a field is not visible or not readable, return an empty string
and confidence "low". If the photo shows a different document type, set detected_doc_type accordingly.
Dates as YYYY-MM-DD when the full date is readable, otherwise as printed.`;
}

export const DOCUMENT_EXTRACT_USER_TEXT = "Read this document and return the fields you can see.";

// Mirrors the json_schema in SPEC 8.4 exactly (snake_case on the wire). Fields
// are a flat array of { key, value, confidence } rather than one property per
// key, since that keeps the schema flat and non-recursive (SPEC 8.4's own
// note) and lets one schema cover every document type.
export const DOCUMENT_EXTRACT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["detected_doc_type", "fields"],
  properties: {
    detected_doc_type: { type: "string", enum: DOC_TYPES },
    fields: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "value", "confidence"],
        properties: {
          key: { type: "string", enum: FIELD_KEYS },
          value: { type: "string" },
          confidence: { type: "string", enum: CONFIDENCES },
        },
      },
    },
  },
} as const;

export const DocumentExtractFieldWireSchema = z.object({
  key: z.enum(FIELD_KEYS),
  value: z.string(),
  confidence: z.enum(CONFIDENCES),
});

export const DocumentExtractWireSchema = z.object({
  detected_doc_type: z.enum(DOC_TYPES),
  fields: z.array(DocumentExtractFieldWireSchema),
});

export type DocumentExtractWire = z.infer<typeof DocumentExtractWireSchema>;
export type DocumentExtractFieldWire = z.infer<typeof DocumentExtractFieldWireSchema>;

export const ExtractDocumentRequestSchema = z.object({
  imageDataUrl: z.string().startsWith("data:image/"),
  docType: z.enum(DOC_TYPES),
});

export type ExtractDocumentRequest = z.infer<typeof ExtractDocumentRequestSchema>;
