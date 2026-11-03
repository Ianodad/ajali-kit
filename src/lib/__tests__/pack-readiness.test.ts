import { describe, expect, it } from "vitest";

import { canGeneratePack, getChecklistItems, getRequiredItems } from "../pack-readiness";
import type { Incident, OtherParty, Photo } from "../types";

function baseIncident(): Incident {
  return {
    id: "inc-1",
    reference: "AJK-20261103-ABCD",
    status: "draft",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    occurredAt: new Date(2026, 10, 3, 14, 30).toISOString(),
    location: { text: "" },
    conditions: {},
    anyoneInjured: null,
    ownVehicle: { registration: "" },
    otherPartyInvolved: null,
    otherParties: [],
    police: { abstractObtained: false, reviewed: false },
    witnessesPresent: null,
    witnesses: [],
    account: { userWords: "", confirmed: false },
    aiConsent: false,
  };
}

function damagePhoto(): Photo {
  return {
    id: crypto.randomUUID(),
    incidentId: "inc-1",
    category: "own_damage",
    blobId: "blob-1",
    thumbBlobId: "thumb-1",
    width: 100,
    height: 100,
    takenAt: new Date().toISOString(),
  };
}

function confirmedParty(withInsurance = true): OtherParty {
  return {
    id: crypto.randomUUID(),
    driver: withInsurance ? { licenceNumber: { value: "DL-1", confidence: "high", userConfirmed: true } } : {},
    vehicle: withInsurance ? { make: { value: "Toyota", confidence: "high", userConfirmed: true } } : {},
    insurance: withInsurance ? { insurer: { value: "Some Insurer", confidence: "high", userConfirmed: true } } : undefined,
    refusedToShare: false,
    confirmed: true,
  };
}

describe("getRequiredItems", () => {
  it("reports every required item missing on a bare draft incident", () => {
    const items = getRequiredItems(baseIncident(), []);
    expect(items.every((item) => !item.met)).toBe(true);
    expect(canGeneratePack(baseIncident(), [])).toBe(false);
  });

  it("is met once a damage photo, date/location, registration and a confirmed account are all present", () => {
    const incident: Incident = {
      ...baseIncident(),
      location: { text: "Thika Road" },
      ownVehicle: { registration: "KDA 123A" },
      account: { userWords: "x", finalText: "x", confirmed: true },
    };
    const items = getRequiredItems(incident, [damagePhoto()]);
    expect(items.every((item) => item.met)).toBe(true);
    expect(canGeneratePack(incident, [damagePhoto()])).toBe(true);
  });

  it("does not count a document or scene photo as the required damage photo", () => {
    const scenePhoto: Photo = { ...damagePhoto(), category: "scene" };
    const items = getRequiredItems(baseIncident(), [scenePhoto]);
    expect(items.find((item) => item.key === "damage_photo")?.met).toBe(false);
  });

  it("requires location text even when the date is set", () => {
    const incident = baseIncident();
    const items = getRequiredItems(incident, []);
    expect(items.find((item) => item.key === "date_location")?.met).toBe(false);
  });

  it("has no fixHref for the registration item (no My vehicle form yet; fixed inline on the pack page)", () => {
    const items = getRequiredItems(baseIncident(), []);
    expect(items.find((item) => item.key === "registration")?.fixHref).toBeUndefined();
  });
});

describe("getChecklistItems", () => {
  it("always includes the police items, with no other-party or witness items when neither applies", () => {
    const items = getChecklistItems(baseIncident());
    expect(items.map((item) => item.key)).toEqual(["ob_number", "police_abstract"]);
  });

  it("adds other-party items only once otherPartyInvolved is yes, unmet with zero parties on file", () => {
    const incident: Incident = { ...baseIncident(), otherPartyInvolved: "yes", otherParties: [] };
    const items = getChecklistItems(incident);
    expect(items.find((item) => item.key === "other_party_confirmed")?.met).toBe(false);
    expect(items.find((item) => item.key === "other_party_insurance")?.met).toBe(false);
    expect(items.find((item) => item.key === "other_party_licence")?.met).toBe(false);
    expect(items.find((item) => item.key === "other_party_logbook")?.met).toBe(false);
  });

  it("marks other-party items met once every party is confirmed with insurance, licence and logbook on file", () => {
    const incident: Incident = { ...baseIncident(), otherPartyInvolved: "yes", otherParties: [confirmedParty(true)] };
    const items = getChecklistItems(incident);
    expect(items.find((item) => item.key === "other_party_confirmed")?.met).toBe(true);
    expect(items.find((item) => item.key === "other_party_insurance")?.met).toBe(true);
    expect(items.find((item) => item.key === "other_party_licence")?.met).toBe(true);
    expect(items.find((item) => item.key === "other_party_logbook")?.met).toBe(true);
  });

  it("does not treat a refusal to share as satisfying the insurance checklist item (insurance genuinely is not on file)", () => {
    const party = { ...confirmedParty(false), refusedToShare: true };
    const incident: Incident = { ...baseIncident(), otherPartyInvolved: "yes", otherParties: [party] };
    const items = getChecklistItems(incident);
    expect(items.find((item) => item.key === "other_party_insurance")?.met).toBe(false);
  });

  it("does not count an unconfirmed (low-confidence) extracted field as insurance, licence or logbook on file", () => {
    const party: OtherParty = {
      id: crypto.randomUUID(),
      driver: { licenceNumber: { value: "DL-1", confidence: "low", userConfirmed: false } },
      vehicle: { make: { value: "Toyota", confidence: "low", userConfirmed: false } },
      insurance: { insurer: { value: "Some Insurer", confidence: "low", userConfirmed: false } },
      refusedToShare: false,
      confirmed: false,
    };
    const incident: Incident = { ...baseIncident(), otherPartyInvolved: "yes", otherParties: [party] };
    const items = getChecklistItems(incident);
    expect(items.find((item) => item.key === "other_party_insurance")?.met).toBe(false);
    expect(items.find((item) => item.key === "other_party_licence")?.met).toBe(false);
    expect(items.find((item) => item.key === "other_party_logbook")?.met).toBe(false);
  });

  it("adds a witness item only once witnessesPresent is yes", () => {
    const noWitnesses = getChecklistItems(baseIncident());
    expect(noWitnesses.some((item) => item.key === "witness_statement")).toBe(false);

    const incident: Incident = { ...baseIncident(), witnessesPresent: "yes", witnesses: [] };
    const items = getChecklistItems(incident);
    expect(items.find((item) => item.key === "witness_statement")?.met).toBe(false);
  });
});
