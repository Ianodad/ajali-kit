import { renderToBuffer } from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";

import { ClaimPackPdfDocument } from "../pack-pdf-document";
import { buildClaimPackData } from "../../lib/pack-data";
import type { DamageAnalysis, DamageItem, Incident, OtherParty, Photo, Witness } from "../../lib/types";

// Codex review (Phase 6) finding 6: the Phase 6 tests covered pack-data,
// pack-readiness and the filename builder (all pure), but never exercised
// the actual @react-pdf/renderer tree, so a crash inside ClaimPackPdfDocument
// (a bad style, a missing prop on one of its many conditional pages) would
// not be caught until a real browser build. This renders a full pack, every
// page type included, through the real renderer (no mock), and asserts a
// valid PDF came out. It cannot assert A9's overlay-fidelity or A10's
// share/download behaviour (that needs an actual canvas and a browser,
// which this repo has no DOM test harness for in any phase), only that the
// document tree itself does not crash.
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

function analysis(items: DamageItem[]): DamageAnalysis {
  return { model: "mock", analysedAt: new Date().toISOString(), isVehiclePhoto: true, items };
}

function photo(overrides: Partial<Photo>): Photo {
  return {
    id: crypto.randomUUID(),
    incidentId: "inc-1",
    category: "scene",
    blobId: "blob-1",
    thumbBlobId: "thumb-1",
    width: 800,
    height: 600,
    takenAt: new Date().toISOString(),
    ...overrides,
  };
}

// A real, tiny, valid PNG (1x1 transparent pixel), so react-pdf's image
// resolver has something real to decode, closer to a flattened photo than an
// empty string would be.
const TINY_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

describe("ClaimPackPdfDocument", () => {
  it("renders a full pack (every page type) to a valid PDF buffer with no crash", async () => {
    const otherParty: OtherParty = {
      id: "party-1",
      driver: { name: { value: "Confirmed Name", confidence: "high", userConfirmed: true } },
      vehicle: { registration: { value: "KCA 111B", confidence: "high", userConfirmed: true } },
      insurance: { insurer: { value: "Some Insurer", confidence: "high", userConfirmed: true } },
      refusedToShare: false,
      notes: "Said they were in a hurry",
      confirmed: true,
    };
    const witness: Witness = { id: "w1", name: "Jane Witness", phone: "0700111222", consentToContact: true, statement: "Saw it happen" };
    const incident: Incident = {
      id: "inc-1",
      reference: "AJK-20261103-ABCD",
      status: "draft",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      occurredAt: new Date(2026, 10, 3, 14, 30).toISOString(),
      location: { text: "Thika Road, near the Allsops roundabout", lat: -1.2, lng: 36.8 },
      conditions: { weather: "clear", light: "day", road: ["Tarmac"] },
      anyoneInjured: false,
      ownVehicle: { registration: "KDA 123A", ownerName: "Jane Driver" },
      otherPartyInvolved: "yes",
      otherParties: [otherParty],
      police: { obNumber: "OB/55/2026", abstractObtained: false, reviewed: true },
      witnessesPresent: "yes",
      witnesses: [witness],
      account: {
        userWords: "x",
        finalText: "I was stopped at the lights when I was hit from behind.",
        confirmed: true,
        confirmedAt: new Date().toISOString(),
      },
      aiConsent: true,
    };

    const ownDamagePhoto = photo({ category: "own_damage", analysis: analysis([damageItem()]) });
    const otherDamagePhoto = photo({ category: "other_damage", analysis: analysis([damageItem({ part: "front bumper" })]) });
    const scenePhoto = photo({ category: "scene" });
    const platePhoto = photo({ category: "plate" });

    const data = buildClaimPackData(incident, [ownDamagePhoto, otherDamagePhoto, scenePhoto, platePhoto], new Date().toISOString());

    const images = {
      damagePhotos: {
        [ownDamagePhoto.id]: {
          original: { dataUrl: TINY_PNG, width: 800, height: 600 },
          overlay: { dataUrl: TINY_PNG, width: 800, height: 600 },
        },
        [otherDamagePhoto.id]: {
          original: { dataUrl: TINY_PNG, width: 800, height: 600 },
          overlay: { dataUrl: TINY_PNG, width: 800, height: 600 },
        },
      },
      otherPhotos: {
        [scenePhoto.id]: { dataUrl: TINY_PNG, width: 800, height: 600 },
        [platePhoto.id]: { dataUrl: TINY_PNG, width: 800, height: 600 },
      },
    };

    const buffer = await renderToBuffer(ClaimPackPdfDocument({ data, images }));
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.subarray(0, 4).toString("ascii")).toBe("%PDF");
  });
});
