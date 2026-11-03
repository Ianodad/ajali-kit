import { describe, expect, it } from "vitest";

import { buildClaimPackData } from "../pack-data";
import type { DamageAnalysis, DamageItem, Incident, OtherParty, Photo, Witness } from "../types";

function baseIncident(): Incident {
  return {
    id: "inc-1",
    reference: "AJK-20261103-ABCD",
    status: "draft",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    occurredAt: new Date(2026, 10, 3, 14, 30).toISOString(),
    location: { text: "Thika Road", lat: -1.2, lng: 36.8 },
    conditions: { weather: "clear", road: ["Tarmac"] },
    anyoneInjured: false,
    ownVehicle: { registration: "KDA 123A", ownerName: "Jane Driver" },
    otherPartyInvolved: null,
    otherParties: [],
    police: { abstractObtained: false, reviewed: true },
    witnessesPresent: null,
    witnesses: [],
    account: { userWords: "Own words", finalText: "Final account text", confirmed: true, confirmedAt: new Date().toISOString() },
    aiConsent: true,
  };
}

function damageItem(overrides: Partial<DamageItem> = {}): DamageItem {
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
    ...overrides,
  };
}

function damageAnalysis(items: DamageItem[]): DamageAnalysis {
  return { model: "mock", analysedAt: new Date().toISOString(), isVehiclePhoto: true, items };
}

function photo(overrides: Partial<Photo>): Photo {
  return {
    id: crypto.randomUUID(),
    incidentId: "inc-1",
    category: "scene",
    blobId: "blob-1",
    thumbBlobId: "thumb-1",
    width: 100,
    height: 100,
    takenAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("buildClaimPackData", () => {
  it("numbers damage photos as photo-1, photo-2 in order, own vs other by category", () => {
    const ownPhoto = photo({ category: "own_damage", analysis: damageAnalysis([damageItem()]) });
    const otherPhoto = photo({ category: "other_damage", analysis: damageAnalysis([damageItem({ part: "front bumper" })]) });
    const data = buildClaimPackData(baseIncident(), [ownPhoto, otherPhoto], "2026-11-03T15:00:00.000Z");

    expect(data.damagePhotos.map((p) => p.photoRef)).toEqual(["photo-1", "photo-2"]);
    expect(data.damagePhotos[0].vehicle).toBe("own");
    expect(data.damagePhotos[1].vehicle).toBe("other");
    expect(data.damageSchedule).toEqual([
      { vehicle: "own", part: "rear bumper", damageType: "dent", severity: "moderate", photoRef: "photo-1" },
      { vehicle: "other", part: "front bumper", damageType: "dent", severity: "moderate", photoRef: "photo-2" },
    ]);
  });

  it("drops pending and deleted items from the damage schedule but keeps the confirmed item's original colour index", () => {
    const items = [damageItem({ status: "deleted" }), damageItem({ status: "confirmed", part: "door" }), damageItem({ status: "pending" })];
    const ownPhoto = photo({ category: "own_damage", analysis: damageAnalysis(items) });
    const data = buildClaimPackData(baseIncident(), [ownPhoto], "2026-11-03T15:00:00.000Z");

    expect(data.damagePhotos[0].items).toHaveLength(1);
    expect(data.damagePhotos[0].items[0].item.part).toBe("door");
    expect(data.damagePhotos[0].items[0].colorIndex).toBe(1); // the deleted item at index 0 still "used" colour 0
    expect(data.damageSchedule).toEqual([{ vehicle: "own", part: "door", damageType: "dent", severity: "moderate", photoRef: "photo-1" }]);
  });

  it("puts scene, own_vehicle, other_vehicle, plate and other photos in otherPhotos, not document photos", () => {
    const photos = [
      photo({ category: "scene" }),
      photo({ category: "own_vehicle" }),
      photo({ category: "other_vehicle" }),
      photo({ category: "plate" }),
      photo({ category: "document", docType: "driving_licence" }),
    ];
    const data = buildClaimPackData(baseIncident(), photos, "2026-11-03T15:00:00.000Z");
    expect(data.otherPhotos).toHaveLength(4);
  });

  it("only surfaces other-party fields the user actually confirmed", () => {
    const party: OtherParty = {
      id: "party-1",
      driver: {
        name: { value: "Confirmed Name", confidence: "high", userConfirmed: true },
        licenceNumber: { value: "Unconfirmed Licence", confidence: "low", userConfirmed: false },
      },
      vehicle: { registration: { value: "KCA 111B", confidence: "high", userConfirmed: true } },
      refusedToShare: false,
      confirmed: false,
    };
    const incident: Incident = { ...baseIncident(), otherPartyInvolved: "yes", otherParties: [party] };
    const data = buildClaimPackData(incident, [], "2026-11-03T15:00:00.000Z");

    expect(data.otherParties[0].driverName).toBe("Confirmed Name");
    expect(data.otherParties[0].vehicleRegistration).toBe("KCA 111B");
    expect(data.otherParties[0].licenceNumber).toBeUndefined();
  });

  it("includes a witness phone only with consent to contact (SPEC F9 item 10)", () => {
    const consented: Witness = { id: "w1", name: "Consented Witness", phone: "0700111222", consentToContact: true, statement: "Saw it" };
    const notConsented: Witness = { id: "w2", name: "Quiet Witness", phone: "0700333444", consentToContact: false, statement: "Also saw it" };
    const incident: Incident = { ...baseIncident(), witnessesPresent: "yes", witnesses: [consented, notConsented] };
    const data = buildClaimPackData(incident, [], "2026-11-03T15:00:00.000Z");

    expect(data.witnesses[0].phone).toBe("0700111222");
    expect(data.witnesses[1].phone).toBeUndefined();
  });

  it("lists outstanding items for anything required or checklisted that is not yet met", () => {
    const incident: Incident = { ...baseIncident(), ownVehicle: { registration: "" }, account: { userWords: "", confirmed: false } };
    const data = buildClaimPackData(incident, [], "2026-11-03T15:00:00.000Z");

    expect(data.outstandingLabels).toContain("At least one damage photo");
    expect(data.outstandingLabels).toContain("Your vehicle's registration");
    expect(data.outstandingLabels).toContain("Your confirmed account");
    expect(data.outstandingLabels).toContain("Police OB number");
  });

  it("falls back to the user's own words when there is no final text", () => {
    const incident: Incident = { ...baseIncident(), account: { userWords: "Just my own words", confirmed: false } };
    const data = buildClaimPackData(incident, [], "2026-11-03T15:00:00.000Z");
    expect(data.accountText).toBe("Just my own words");
  });
});
