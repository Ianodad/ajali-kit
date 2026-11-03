import type { DocumentExtractWire, FieldKey } from "@/lib/schemas/document-extract";
import type { DocType, ExtractedField, OtherParty } from "@/lib/types";

// SPEC 8.4 ("The app maps keys to form fields and never overwrites a field
// the user already confirmed") and F5 step 3. Shared by the real path and the
// mock fixtures, same approach as analyze-photo-mapping.ts.

export interface ExtractDocumentData {
  model: string;
  detectedDocType: DocType;
  fields: { key: FieldKey; value: string; confidence: ExtractedField["confidence"] }[];
}

// The three doc types the S12 scan buttons and applyExtractedFields below
// actually know how to map onto an OtherParty. A detected type outside this
// list (national_id, police_abstract, other) has no mapping, so a mismatch
// against one of those cannot offer "use it as X" the way a mismatch between
// the three scannable types can (P4.R finding 4).
export const SCANNABLE_DOC_TYPES: readonly DocType[] = ["driving_licence", "logbook", "insurance_certificate"];

export function isScannableDocType(docType: DocType): boolean {
  return SCANNABLE_DOC_TYPES.includes(docType);
}

export function mapDocumentExtract(wire: DocumentExtractWire, model: string): ExtractDocumentData {
  return {
    model,
    detectedDocType: wire.detected_doc_type,
    fields: wire.fields.map((field) => ({ key: field.key, value: field.value, confidence: field.confidence })),
  };
}

function fieldFrom(fields: ExtractDocumentData["fields"], key: FieldKey): ExtractedField | undefined {
  const match = fields.find((f) => f.key === key);
  if (!match) return undefined;
  return { value: match.value, confidence: match.confidence, userConfirmed: false };
}

// Only the fields a given document type can actually show. Keeps a scanned
// logbook from, say, writing a stray driver.name over a value the licence
// scan already filled in.
function fieldValue(fields: ExtractDocumentData["fields"], key: FieldKey): string | undefined {
  return fields.find((f) => f.key === key)?.value;
}

// Applies a scan's extracted fields onto one OtherParty, per the docType the
// user scanned (or, if different, the docType Muse Spark actually detected).
// A field the user already confirmed (ExtractedField.userConfirmed) is left
// untouched (A6); a plain string field (vehicle.colour) is only filled when
// still empty, since it carries no confidence to compare against.
// Keeps `current` when it is user-confirmed (A6); otherwise swaps in the
// scan's value for `sourceKey`, if the model returned one.
function pick(current: ExtractedField | undefined, fields: ExtractDocumentData["fields"], sourceKey: FieldKey): ExtractedField | undefined {
  if (current?.userConfirmed) return current;
  return fieldFrom(fields, sourceKey) ?? current;
}

export function applyExtractedFields(party: OtherParty, docType: DocType, fields: ExtractDocumentData["fields"]): OtherParty {
  const next: OtherParty = {
    ...party,
    driver: { ...party.driver },
    vehicle: { ...party.vehicle },
    owner: party.owner ? { ...party.owner } : party.owner,
    insurance: party.insurance ? { ...party.insurance } : party.insurance,
  };

  if (docType === "driving_licence") {
    next.driver.name = pick(next.driver.name, fields, "full_name");
    next.driver.idNumber = pick(next.driver.idNumber, fields, "id_number");
    next.driver.licenceNumber = pick(next.driver.licenceNumber, fields, "licence_number");
    next.driver.licenceExpiry = pick(next.driver.licenceExpiry, fields, "licence_expiry");
  } else if (docType === "logbook") {
    next.vehicle.registration = pick(next.vehicle.registration, fields, "registration");
    next.vehicle.make = pick(next.vehicle.make, fields, "make");
    next.vehicle.model = pick(next.vehicle.model, fields, "model");
    // A logbook naming an owner is itself a sign the owner differs from the
    // driver, so this opens the owner section rather than requiring the user
    // to tick "Owner is different from the driver" first.
    if (fieldValue(fields, "owner_name")) {
      next.owner = { ...next.owner, name: pick(next.owner?.name, fields, "owner_name") };
    }
    if (!next.vehicle.colour) {
      const colour = fieldValue(fields, "colour");
      if (colour) next.vehicle.colour = colour;
    }
  } else if (docType === "insurance_certificate") {
    if (fieldValue(fields, "insurer") || fieldValue(fields, "policy_or_certificate_number") || fieldValue(fields, "cover_expiry")) {
      next.insurance = {
        insurer: pick(next.insurance?.insurer, fields, "insurer"),
        policyOrCertificateNo: pick(next.insurance?.policyOrCertificateNo, fields, "policy_or_certificate_number"),
        expiry: pick(next.insurance?.expiry, fields, "cover_expiry"),
      };
    }
    next.vehicle.registration = pick(next.vehicle.registration, fields, "registration");
    if (fieldValue(fields, "full_name")) {
      next.owner = { ...next.owner, name: pick(next.owner?.name, fields, "full_name") };
    }
  }

  // A scan that actually changed or added a field (locked fields and
  // repeats of the same value do not count) means there is something new
  // to review, so the party-level "These details are correct" tick must be
  // re-done even though the individual locked fields stay locked (P4.R
  // finding 3: confirming a licence must not let a later logbook scan add
  // unreviewed fields while the card still reads "Confirmed").
  const before = JSON.stringify({ driver: party.driver, vehicle: party.vehicle, owner: party.owner, insurance: party.insurance });
  const after = JSON.stringify({ driver: next.driver, vehicle: next.vehicle, owner: next.owner, insurance: next.insurance });
  if (before !== after) {
    next.confirmed = false;
  }

  return next;
}

// SPEC F5 step 3's "These details are correct" checkbox: locks every
// extracted field so a later re-scan cannot silently overwrite it.
export function confirmOtherParty(party: OtherParty): OtherParty {
  const lock = (field: ExtractedField | undefined): ExtractedField | undefined =>
    field ? { ...field, userConfirmed: true } : field;
  return {
    ...party,
    confirmed: true,
    driver: {
      ...party.driver,
      name: lock(party.driver.name),
      idNumber: lock(party.driver.idNumber),
      licenceNumber: lock(party.driver.licenceNumber),
      licenceExpiry: lock(party.driver.licenceExpiry),
    },
    vehicle: {
      ...party.vehicle,
      registration: lock(party.vehicle.registration),
      make: lock(party.vehicle.make),
      model: lock(party.vehicle.model),
    },
    owner: party.owner ? { ...party.owner, name: lock(party.owner.name) } : party.owner,
    insurance: party.insurance
      ? {
          ...party.insurance,
          insurer: lock(party.insurance.insurer),
          policyOrCertificateNo: lock(party.insurance.policyOrCertificateNo),
          expiry: lock(party.insurance.expiry),
        }
      : party.insurance,
  };
}

// A manual edit is taken as the user's own word, so it is marked confirmed
// immediately: a later re-scan must not overwrite it either.
export function manualExtractedField(value: string): ExtractedField {
  return { value, confidence: "high", userConfirmed: true };
}

// F5 edge state: "We couldn't read this clearly" when every field the model
// did return for this doc type came back empty.
export function isBlurryResult(fields: ExtractDocumentData["fields"]): boolean {
  return fields.length > 0 && fields.every((field) => field.value.trim() === "");
}
