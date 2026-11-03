import type { DocumentExtractWire } from "@/lib/schemas/document-extract";
import type { DocType } from "@/lib/types";

// Mock fixtures for /api/extract-document (AJALI_MOCK=1 or x-ajali-mock: 1).
// Every value here is obviously fake (SPEC 11 "demo data" rule): no real
// person, plate or policy exists. One fixture per scannable doc type, plus
// a blurry-scan fixture for the "we couldn't read this clearly" edge state.

export const EXTRACT_DOCUMENT_FIXTURE_LICENCE: DocumentExtractWire = {
  detected_doc_type: "driving_licence",
  fields: [
    { key: "full_name", value: "JOHN SAMPLE MWANGI", confidence: "high" },
    { key: "id_number", value: "00000000", confidence: "medium" },
    { key: "licence_number", value: "DL-SAMPLE-0001", confidence: "high" },
    { key: "licence_expiry", value: "2027-01-01", confidence: "medium" },
  ],
};

export const EXTRACT_DOCUMENT_FIXTURE_LOGBOOK: DocumentExtractWire = {
  detected_doc_type: "logbook",
  fields: [
    { key: "registration", value: "KAA 000A", confidence: "high" },
    { key: "make", value: "Toyota", confidence: "high" },
    { key: "model", value: "Sample Model", confidence: "medium" },
    { key: "colour", value: "White", confidence: "low" },
    { key: "owner_name", value: "JANE SAMPLE OWNER", confidence: "high" },
    { key: "chassis_number", value: "CHASSIS-SAMPLE-0001", confidence: "medium" },
  ],
};

export const EXTRACT_DOCUMENT_FIXTURE_INSURANCE: DocumentExtractWire = {
  detected_doc_type: "insurance_certificate",
  fields: [
    { key: "full_name", value: "JANE SAMPLE OWNER", confidence: "high" },
    { key: "registration", value: "KAA 000A", confidence: "high" },
    { key: "insurer", value: "Sample Insurer Ltd", confidence: "medium" },
    { key: "policy_or_certificate_number", value: "POL-SAMPLE-0001", confidence: "high" },
    { key: "cover_start", value: "2026-01-01", confidence: "medium" },
    { key: "cover_expiry", value: "2026-12-31", confidence: "medium" },
  ],
};

// Edge state (F5): "Blurry document: we couldn't read this clearly." Every
// field comes back empty and low confidence, matching what a real blurry
// photo would produce (SPEC 8.4's "not readable -> empty string, confidence
// low" instruction), rather than an error.
export const EXTRACT_DOCUMENT_FIXTURE_BLURRY: DocumentExtractWire = {
  detected_doc_type: "driving_licence",
  fields: [
    { key: "full_name", value: "", confidence: "low" },
    { key: "id_number", value: "", confidence: "low" },
    { key: "licence_number", value: "", confidence: "low" },
    { key: "licence_expiry", value: "", confidence: "low" },
  ],
};

export const EXTRACT_DOCUMENT_FIXTURES_BY_DOC_TYPE: Partial<Record<DocType, DocumentExtractWire>> = {
  driving_licence: EXTRACT_DOCUMENT_FIXTURE_LICENCE,
  logbook: EXTRACT_DOCUMENT_FIXTURE_LOGBOOK,
  insurance_certificate: EXTRACT_DOCUMENT_FIXTURE_INSURANCE,
};

// Falls back to the licence fixture for a doc type with no dedicated fixture
// (police_abstract, national_id, other): not in scope for F5's three scan
// buttons, but the route must still return something plausible rather than
// throw.
export function getExtractDocumentFixture(docType: DocType): DocumentExtractWire {
  return EXTRACT_DOCUMENT_FIXTURES_BY_DOC_TYPE[docType] ?? EXTRACT_DOCUMENT_FIXTURE_LICENCE;
}
