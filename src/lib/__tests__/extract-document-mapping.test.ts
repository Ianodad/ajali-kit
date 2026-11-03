import { describe, expect, it } from "vitest";

import {
  applyExtractedFields,
  confirmOtherParty,
  isBlurryResult,
  isScannableDocType,
  manualExtractedField,
  mapDocumentExtract,
} from "@/lib/extract-document-mapping";
import type { DocumentExtractWire } from "@/lib/schemas/document-extract";
import type { OtherParty } from "@/lib/types";

function blankParty(): OtherParty {
  return { id: "party-1", driver: {}, vehicle: {}, refusedToShare: false, confirmed: false };
}

describe("mapDocumentExtract", () => {
  it("carries the detected doc type and flattens the fields", () => {
    const wire: DocumentExtractWire = {
      detected_doc_type: "logbook",
      fields: [{ key: "registration", value: "KAA 000A", confidence: "high" }],
    };
    const data = mapDocumentExtract(wire, "mock");
    expect(data.model).toBe("mock");
    expect(data.detectedDocType).toBe("logbook");
    expect(data.fields).toEqual([{ key: "registration", value: "KAA 000A", confidence: "high" }]);
  });
});

describe("applyExtractedFields", () => {
  it("fills driver fields from a licence scan", () => {
    const party = applyExtractedFields(blankParty(), "driving_licence", [
      { key: "full_name", value: "JOHN SAMPLE", confidence: "high" },
      { key: "licence_number", value: "DL-1", confidence: "medium" },
    ]);
    expect(party.driver.name).toEqual({ value: "JOHN SAMPLE", confidence: "high", userConfirmed: false });
    expect(party.driver.licenceNumber).toEqual({ value: "DL-1", confidence: "medium", userConfirmed: false });
  });

  it("fills vehicle and opens the owner section from a logbook scan", () => {
    const party = applyExtractedFields(blankParty(), "logbook", [
      { key: "registration", value: "KAA 000A", confidence: "high" },
      { key: "colour", value: "White", confidence: "low" },
      { key: "owner_name", value: "JANE SAMPLE", confidence: "high" },
    ]);
    expect(party.vehicle.registration?.value).toBe("KAA 000A");
    expect(party.vehicle.colour).toBe("White");
    expect(party.owner?.name?.value).toBe("JANE SAMPLE");
  });

  it("never overwrites a field the user already confirmed (A6)", () => {
    const confirmedParty: OtherParty = {
      ...blankParty(),
      driver: { name: { value: "USER TYPED NAME", confidence: "high", userConfirmed: true } },
    };
    const party = applyExtractedFields(confirmedParty, "driving_licence", [
      { key: "full_name", value: "SOMETHING ELSE", confidence: "high" },
    ]);
    expect(party.driver.name?.value).toBe("USER TYPED NAME");
  });

  it("does not overwrite an existing colour with a new scan", () => {
    const party = applyExtractedFields({ ...blankParty(), vehicle: { colour: "Blue" } }, "logbook", [
      { key: "colour", value: "Red", confidence: "high" },
    ]);
    expect(party.vehicle.colour).toBe("Blue");
  });

  it("fills insurance fields and vehicle registration from a certificate scan", () => {
    const party = applyExtractedFields(blankParty(), "insurance_certificate", [
      { key: "insurer", value: "Sample Insurer Ltd", confidence: "medium" },
      { key: "policy_or_certificate_number", value: "POL-1", confidence: "high" },
      { key: "registration", value: "KAA 000A", confidence: "high" },
    ]);
    expect(party.insurance?.insurer?.value).toBe("Sample Insurer Ltd");
    expect(party.insurance?.policyOrCertificateNo?.value).toBe("POL-1");
    expect(party.vehicle.registration?.value).toBe("KAA 000A");
  });
});

describe("confirmOtherParty", () => {
  it("sets confirmed and locks every extracted field", () => {
    const party = applyExtractedFields(blankParty(), "driving_licence", [
      { key: "full_name", value: "JOHN SAMPLE", confidence: "high" },
    ]);
    const confirmed = confirmOtherParty(party);
    expect(confirmed.confirmed).toBe(true);
    expect(confirmed.driver.name?.userConfirmed).toBe(true);
  });

  it("a locked field survives a later re-scan, and confirmation survives too since nothing changed", () => {
    const party = applyExtractedFields(blankParty(), "driving_licence", [
      { key: "full_name", value: "JOHN SAMPLE", confidence: "high" },
    ]);
    const confirmed = confirmOtherParty(party);
    const rescanned = applyExtractedFields(confirmed, "driving_licence", [
      { key: "full_name", value: "DIFFERENT NAME", confidence: "high" },
    ]);
    expect(rescanned.driver.name?.value).toBe("JOHN SAMPLE");
    expect(rescanned.confirmed).toBe(true);
  });

  it("clears party-level confirmation when a later scan adds a new field, while keeping the earlier lock", () => {
    const party = applyExtractedFields(blankParty(), "driving_licence", [
      { key: "full_name", value: "JOHN SAMPLE", confidence: "high" },
    ]);
    const confirmed = confirmOtherParty(party);
    expect(confirmed.confirmed).toBe(true);

    const afterLogbookScan = applyExtractedFields(confirmed, "logbook", [
      { key: "registration", value: "KAA 000A", confidence: "high" },
    ]);
    expect(afterLogbookScan.confirmed).toBe(false);
    expect(afterLogbookScan.driver.name).toEqual({ value: "JOHN SAMPLE", confidence: "high", userConfirmed: true });
    expect(afterLogbookScan.vehicle.registration?.value).toBe("KAA 000A");
  });
});

describe("manualExtractedField", () => {
  it("marks a manually typed value as confirmed and high confidence", () => {
    expect(manualExtractedField("Hand typed")).toEqual({ value: "Hand typed", confidence: "high", userConfirmed: true });
  });
});

describe("isBlurryResult", () => {
  it("is true when every returned field is empty", () => {
    expect(
      isBlurryResult([
        { key: "full_name", value: "", confidence: "low" },
        { key: "licence_number", value: "", confidence: "low" },
      ]),
    ).toBe(true);
  });

  it("is false when at least one field has a value", () => {
    expect(
      isBlurryResult([
        { key: "full_name", value: "JOHN SAMPLE", confidence: "high" },
        { key: "licence_number", value: "", confidence: "low" },
      ]),
    ).toBe(false);
  });

  it("is false when the model returned no fields at all", () => {
    expect(isBlurryResult([])).toBe(false);
  });
});

describe("isScannableDocType", () => {
  it("is true for the three S12 scan-button types", () => {
    expect(isScannableDocType("driving_licence")).toBe(true);
    expect(isScannableDocType("logbook")).toBe(true);
    expect(isScannableDocType("insurance_certificate")).toBe(true);
  });

  it("is false for a doc type with no OtherParty mapping", () => {
    expect(isScannableDocType("national_id")).toBe(false);
    expect(isScannableDocType("police_abstract")).toBe(false);
    expect(isScannableDocType("other")).toBe(false);
  });
});
