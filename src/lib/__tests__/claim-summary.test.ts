import { describe, expect, it } from "vitest";

import { buildClaimSummary, redactFreeText } from "../claim-summary";
import type { DamageAnalysis, DamageItem, Incident, OtherParty, Photo, Witness } from "../types";

// SPEC 8.5 / section 11 and the Phase 5 brief: the claim-draft summary must
// carry no IDs, phone numbers, plates (own or other party) or photos. Every
// sensitive value below is a literal that must never show up, in any form,
// in the built summary.

const OWN_PLATE = "KDZ 999Z";
const OWN_PHONE = "+254700111222";
const OWN_POLICY_NUMBER = "POL-SECRET-0001";
const OTHER_PLATE = "KCA 111B";
const OTHER_ID_NUMBER = "11112222";
const OTHER_LICENCE_NUMBER = "DL-SECRET-9999";
const OTHER_NAME = "Secret Driver Name";
const OTHER_OWNER_PHONE = "+254700333444";
const OB_NUMBER = "OB/55/2026";
const WITNESS_NAME = "Secret Witness Name";
const WITNESS_PHONE = "+254700555666";
const BLOB_ID = "blob-should-never-appear";

function damageItem(): DamageItem {
  return {
    id: crypto.randomUUID(),
    samObjectId: 1,
    part: "rear bumper",
    damageType: "dent",
    severity: "moderate",
    description: "Dent on the rear bumper",
    boxNorm: [0, 0, 100, 100],
    boxPx: { left: 0, top: 0, right: 100, bottom: 100 },
    source: "ai",
    status: "confirmed",
  };
}

function damageAnalysis(items: DamageItem[]): DamageAnalysis {
  return { model: "mock", analysedAt: new Date().toISOString(), isVehiclePhoto: true, items };
}

function ownDamagePhoto(): Photo {
  return {
    id: crypto.randomUUID(),
    incidentId: "inc-1",
    category: "own_damage",
    blobId: BLOB_ID,
    thumbBlobId: BLOB_ID,
    width: 100,
    height: 100,
    takenAt: new Date().toISOString(),
    analysis: damageAnalysis([damageItem()]),
  };
}

function otherParty(): OtherParty {
  return {
    id: crypto.randomUUID(),
    driver: {
      name: { value: OTHER_NAME, confidence: "high", userConfirmed: true },
      idNumber: { value: OTHER_ID_NUMBER, confidence: "high", userConfirmed: true },
      licenceNumber: { value: OTHER_LICENCE_NUMBER, confidence: "high", userConfirmed: true },
    },
    vehicle: { registration: { value: OTHER_PLATE, confidence: "high", userConfirmed: true }, make: { value: "Toyota", confidence: "high", userConfirmed: true } },
    owner: { phone: OTHER_OWNER_PHONE },
    insurance: { insurer: { value: "Some Insurer", confidence: "high", userConfirmed: true } },
    refusedToShare: false,
    notes: "Said they were in a hurry",
    confirmed: true,
  };
}

function witness(): Witness {
  return { id: crypto.randomUUID(), name: WITNESS_NAME, phone: WITNESS_PHONE, consentToContact: true, statement: "Saw the other car brake late" };
}

function buildIncident(): Incident {
  return {
    id: "inc-1",
    reference: "AJK-20261103-ABCD",
    status: "draft",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    // Built from local components (not a hand-written offset literal), same
    // convention datetime.test.ts uses: toLocalInputValue's output then
    // matches regardless of which timezone the test actually runs in.
    occurredAt: new Date(2026, 10, 3, 14, 30).toISOString(),
    location: { text: "Thika Road, near the Allsops roundabout", lat: -1.2, lng: 36.8, accuracyM: 10 },
    conditions: { weather: "clear", light: "day", road: ["Tarmac"] },
    anyoneInjured: false,
    shortDescription: "Rear-ended at the lights",
    ownVehicle: {
      registration: OWN_PLATE,
      make: "Subaru",
      model: "Forester",
      colour: "Blue",
      policyNumber: OWN_POLICY_NUMBER,
      ownerPhone: OWN_PHONE,
    },
    otherPartyInvolved: "yes",
    otherParties: [otherParty()],
    police: { obNumber: OB_NUMBER, abstractObtained: false, reviewed: true },
    witnessesPresent: "yes",
    witnesses: [witness()],
    account: { userWords: "I was stopped at the lights when I was hit from behind.", confirmed: false },
    aiConsent: true,
  };
}

describe("buildClaimSummary", () => {
  it("never includes IDs, phone numbers, plates or photo data", () => {
    const incident = buildIncident();
    const photos = [ownDamagePhoto()];
    const summary = buildClaimSummary(incident, photos);
    const json = JSON.stringify(summary);

    for (const secret of [
      OWN_PLATE,
      OWN_PHONE,
      OWN_POLICY_NUMBER,
      OTHER_PLATE,
      OTHER_ID_NUMBER,
      OTHER_LICENCE_NUMBER,
      OTHER_NAME,
      OTHER_OWNER_PHONE,
      OB_NUMBER,
      WITNESS_NAME,
      WITNESS_PHONE,
      BLOB_ID,
    ]) {
      expect(json).not.toContain(secret);
    }
  });

  it("carries only the facts the draft needs, as plain text or booleans", () => {
    const incident = buildIncident();
    const summary = buildClaimSummary(incident, [ownDamagePhoto()]);

    expect(summary.occurredAtLocal).toBe("2026-11-03T14:30");
    expect(summary.locationText).toBe(incident.location.text);
    expect(summary.userWords).toBe(incident.account.userWords);
    expect(summary.ownVehicleMake).toBe("Subaru");
    expect(summary.damageItems).toEqual([
      { vehicle: "own", photoRef: "photo-1", part: "rear bumper", damageType: "dent", severity: "moderate", description: "Dent on the rear bumper" },
    ]);
    expect(summary.obNumberKnown).toBe(true);
    expect(summary.otherParties).toEqual([
      {
        vehicleMake: "Toyota",
        vehicleColour: undefined,
        vehicleModel: undefined,
        insuranceOnFile: true,
        licenceOnFile: true,
        logbookOnFile: true,
        admissionNotes: "Said they were in a hurry",
        refusedToShare: false,
      },
    ]);
    expect(summary.witnessStatements).toEqual(["Saw the other car brake late"]);
  });

  it("drops unconfirmed and deleted damage items", () => {
    const incident = buildIncident();
    const pendingItem: DamageItem = { ...damageItem(), id: crypto.randomUUID(), status: "pending" };
    const deletedItem: DamageItem = { ...damageItem(), id: crypto.randomUUID(), status: "deleted" };
    const photo: Photo = { ...ownDamagePhoto(), analysis: damageAnalysis([pendingItem, deletedItem]) };

    const summary = buildClaimSummary(incident, [photo]);
    expect(summary.damageItems).toEqual([]);
  });

  // Codex review finding 1: free text (the user's own words, a party's
  // notes, a witness statement) is not extracted field by field, so a phone
  // number, ID number or plate typed into a sentence would otherwise reach
  // the model unchanged.
  it("redacts a phone number, ID number or plate typed into free text", () => {
    const incident = buildIncident();
    incident.account.userWords = "The other driver's number is 0712345678, their ID is 23456789 and their plate was KBZ 456C.";
    incident.otherParties[0].notes = "Call them on 0798765432 if needed.";
    incident.witnesses[0].statement = "I am on 0711222333, saw it from across the road.";

    const summary = buildClaimSummary(incident, [ownDamagePhoto()]);
    const json = JSON.stringify(summary);

    for (const secret of ["0712345678", "23456789", "KBZ 456C", "0798765432", "0711222333"]) {
      expect(json).not.toContain(secret);
    }
    expect(summary.userWords).toContain("[redacted]");
    expect(summary.otherParties[0].admissionNotes).toContain("[redacted]");
    expect(summary.witnessStatements[0]).toContain("[redacted]");
  });

  // Browser-run bug (a): Incident.occurredAt is a UTC instant (new
  // Date().toISOString()), so an incident actually created at 11:38 local
  // time is stored with "08:38" in the raw string three hours east of UTC.
  // occurredAtLocal must reflect local wall-clock time, not those raw digits.
  it("converts occurredAt to local wall-clock time, not the raw UTC digits", () => {
    const incident = buildIncident();
    incident.occurredAt = new Date(2026, 10, 3, 11, 38).toISOString();

    const summary = buildClaimSummary(incident, []);
    expect(summary.occurredAtLocal).toBe("2026-11-03T11:38");
  });

  // Browser-run bug (b): the summary must name the typed place, not GPS
  // coordinates, so the mock (and the real model) can mention it by name.
  it("carries the typed location text, never the GPS coordinates", () => {
    const incident = buildIncident();
    incident.location = { text: "Mombasa Road near Capital Centre", lat: -1.3167, lng: 36.8333, accuracyM: 12 };

    const summary = buildClaimSummary(incident, []);
    expect(summary.locationText).toBe("Mombasa Road near Capital Centre");
    const json = JSON.stringify(summary);
    expect(json).not.toContain("-1.3167");
    expect(json).not.toContain("36.8333");
  });
});

describe("redactFreeText", () => {
  it("leaves ordinary sentences untouched", () => {
    expect(redactFreeText("I was stopped at the lights when I was hit from behind.")).toBe(
      "I was stopped at the lights when I was hit from behind.",
    );
  });
});
