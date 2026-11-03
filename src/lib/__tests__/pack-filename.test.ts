import { describe, expect, it } from "vitest";

import { buildPackFileName } from "../pack-filename";
import type { Incident } from "../types";

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

describe("buildPackFileName", () => {
  it("strips spaces from the registration and uses the incident's own local date", () => {
    const incident: Incident = { ...baseIncident(), ownVehicle: { registration: "KDA 123A" } };
    expect(buildPackFileName(incident)).toBe("Ajali-Kit-Claim-KDA123A-2026-11-03.pdf");
  });

  it("uppercases a lowercase registration", () => {
    const incident: Incident = { ...baseIncident(), ownVehicle: { registration: "kda 123a" } };
    expect(buildPackFileName(incident)).toBe("Ajali-Kit-Claim-KDA123A-2026-11-03.pdf");
  });

  it("falls back to UNKNOWN when no registration is on file", () => {
    const incident = baseIncident();
    expect(buildPackFileName(incident)).toBe("Ajali-Kit-Claim-UNKNOWN-2026-11-03.pdf");
  });
});
