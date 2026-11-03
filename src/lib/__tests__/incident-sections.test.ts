import { describe, expect, it } from "vitest";

import {
  getAccountStatus,
  getDamageReviewStatus,
  getOtherPartyStatus,
  getPackStatus,
  getPhotoChecklistStatus,
  getPoliceReportStatus,
  getSectionStatus,
  getWitnessesStatus,
} from "../incident-sections";
import type { DamageAnalysis, DamageItem, Incident, OtherParty, Photo, Witness } from "../types";

function photo(category: Photo["category"], analysis?: DamageAnalysis): Photo {
  return {
    id: crypto.randomUUID(),
    incidentId: "inc-1",
    category,
    blobId: crypto.randomUUID(),
    thumbBlobId: crypto.randomUUID(),
    width: 100,
    height: 100,
    takenAt: new Date().toISOString(),
    analysis,
  };
}

function damageItem(status: DamageItem["status"]): DamageItem {
  return {
    id: crypto.randomUUID(),
    samObjectId: 1,
    part: "bumper",
    damageType: "dent",
    severity: "minor",
    description: "d",
    boxNorm: [0, 0, 100, 100],
    boxPx: { left: 0, top: 0, right: 100, bottom: 100 },
    source: "ai",
    status,
  };
}

function analysis(items: DamageItem[]): DamageAnalysis {
  return { model: "mock", analysedAt: new Date().toISOString(), isVehiclePhoto: true, items };
}

// Pack readiness (Phase 6) reads location, ownVehicle and account, so the
// shared stub carries minimal real values for those instead of leaving them
// undefined, same as every other field here that a particular describe
// block cares about.
const incident = {
  id: "inc-1",
  status: "draft",
  occurredAt: new Date().toISOString(),
  location: { text: "Thika Road" },
  ownVehicle: { registration: "KDA 123A" },
  account: { userWords: "", confirmed: false },
} as Incident;

describe("getPhotoChecklistStatus", () => {
  it("is needed with no photos", () => {
    expect(getPhotoChecklistStatus([])).toBe("needed");
  });

  it("is in_progress once some but not all required shots are met", () => {
    const photos = [photo("scene")];
    expect(getPhotoChecklistStatus(photos)).toBe("in_progress");
  });

  it("is done once every required shot has its minimum count", () => {
    const photos = [
      photo("scene"),
      photo("own_vehicle"),
      photo("own_vehicle"),
      photo("own_vehicle"),
      photo("own_vehicle"),
      photo("own_damage"),
    ];
    expect(getPhotoChecklistStatus(photos)).toBe("done");
  });

  it("does not require the optional other-party shots to be done", () => {
    const photos = [
      photo("scene"),
      photo("own_vehicle"),
      photo("own_vehicle"),
      photo("own_vehicle"),
      photo("own_vehicle"),
      photo("own_damage"),
    ];
    // no other_damage or plate photos, still done because those are optional
    expect(photos.some((p) => p.category === "plate")).toBe(false);
    expect(getPhotoChecklistStatus(photos)).toBe("done");
  });
});

describe("getSectionStatus", () => {
  it("delegates to the photo checklist for the photos section", () => {
    expect(getSectionStatus("photos", incident, [])).toBe("needed");
    expect(getSectionStatus("photos", incident, [photo("scene")])).toBe("in_progress");
  });

  it("delegates to the pack status for the pack section", () => {
    expect(getSectionStatus("pack", incident, [photo("scene")])).toBe("needed");
  });

  it("delegates to the damage review status for the damage section", () => {
    const photos = [photo("own_damage", analysis([damageItem("pending")]))];
    expect(getSectionStatus("damage", incident, photos)).toBe("in_progress");
  });
});

describe("getPackStatus", () => {
  it("is needed with no damage photo yet, even with everything else in place", () => {
    const ready = { ...incident, account: { userWords: "x", finalText: "x", confirmed: true } } as Incident;
    expect(getPackStatus(ready, [])).toBe("needed");
  });

  it("is needed when a damage photo exists but the account is not confirmed", () => {
    expect(getPackStatus(incident, [photo("own_damage")])).toBe("needed");
  });

  it("is in_progress once every required item is met but the pack has not been generated", () => {
    const ready = { ...incident, account: { userWords: "x", finalText: "x", confirmed: true } } as Incident;
    expect(getPackStatus(ready, [photo("own_damage")])).toBe("in_progress");
  });

  it("is done once the incident status flips to exported", () => {
    const exported = { ...incident, status: "exported", account: { userWords: "x", finalText: "x", confirmed: true } } as Incident;
    expect(getPackStatus(exported, [photo("own_damage")])).toBe("done");
  });
});

describe("getDamageReviewStatus", () => {
  it("is needed with no damage photos", () => {
    expect(getDamageReviewStatus([photo("scene")])).toBe("needed");
  });

  it("is needed when damage photos exist but none have been analysed yet", () => {
    expect(getDamageReviewStatus([photo("own_damage")])).toBe("needed");
  });

  it("is in_progress once a photo is analysed but has unresolved items", () => {
    const photos = [photo("own_damage", analysis([damageItem("pending")]))];
    expect(getDamageReviewStatus(photos)).toBe("in_progress");
  });

  it("is in_progress when one of several damage photos has not been analysed yet", () => {
    const photos = [photo("own_damage", analysis([damageItem("confirmed")])), photo("other_damage")];
    expect(getDamageReviewStatus(photos)).toBe("in_progress");
  });

  it("is done once every item on every analysed damage photo is confirmed or deleted", () => {
    const photos = [photo("own_damage", analysis([damageItem("confirmed"), damageItem("deleted")]))];
    expect(getDamageReviewStatus(photos)).toBe("done");
  });

  it("is done when a photo was analysed and found no damage at all", () => {
    const photos = [photo("own_damage", analysis([]))];
    expect(getDamageReviewStatus(photos)).toBe("done");
  });
});

function otherParty(confirmed: boolean): OtherParty {
  return { id: crypto.randomUUID(), driver: {}, vehicle: {}, refusedToShare: false, confirmed };
}

function withOtherParty(otherPartyInvolved: Incident["otherPartyInvolved"], otherParties: OtherParty[] = []): Incident {
  return { ...incident, otherPartyInvolved, otherParties } as Incident;
}

describe("getOtherPartyStatus", () => {
  it("is needed before the Yes/No/Not sure question is answered", () => {
    expect(getOtherPartyStatus(withOtherParty(null))).toBe("needed");
  });

  it("is done when the user says No", () => {
    expect(getOtherPartyStatus(withOtherParty("no"))).toBe("done");
  });

  it("is in_progress when Yes is picked but no party has been added yet", () => {
    expect(getOtherPartyStatus(withOtherParty("yes"))).toBe("in_progress");
  });

  it("is in_progress when a party exists but is not confirmed", () => {
    expect(getOtherPartyStatus(withOtherParty("yes", [otherParty(false)]))).toBe("in_progress");
  });

  it("is done once every added party is confirmed", () => {
    expect(getOtherPartyStatus(withOtherParty("unsure", [otherParty(true), otherParty(true)]))).toBe("done");
  });

  it("is in_progress when only some of several parties are confirmed", () => {
    expect(getOtherPartyStatus(withOtherParty("yes", [otherParty(true), otherParty(false)]))).toBe("in_progress");
  });
});

function withPolice(police: Incident["police"]): Incident {
  return { ...incident, police } as Incident;
}

describe("getPoliceReportStatus", () => {
  it("is needed when nothing has been touched", () => {
    expect(getPoliceReportStatus(withPolice({ abstractObtained: false, reviewed: false }))).toBe("needed");
  });

  it("is in_progress once a field is filled but the section has not been saved", () => {
    expect(getPoliceReportStatus(withPolice({ station: "Central", abstractObtained: false, reviewed: false }))).toBe("in_progress");
  });

  it("is done once the section has been reviewed, even with an empty OB number (A7)", () => {
    expect(getPoliceReportStatus(withPolice({ abstractObtained: false, reviewed: true }))).toBe("done");
  });
});

function witness(): Witness {
  return { id: crypto.randomUUID(), name: "Jane", consentToContact: false, statement: "Saw it" };
}

function withWitnesses(witnessesPresent: Incident["witnessesPresent"], witnesses: Witness[] = []): Incident {
  return { ...incident, witnessesPresent, witnesses } as Incident;
}

describe("getWitnessesStatus", () => {
  it("is needed before the Yes/No question is answered", () => {
    expect(getWitnessesStatus(withWitnesses(null))).toBe("needed");
  });

  it("is done when the user says No", () => {
    expect(getWitnessesStatus(withWitnesses("no"))).toBe("done");
  });

  it("is in_progress when Yes is picked but no witness has been added yet", () => {
    expect(getWitnessesStatus(withWitnesses("yes"))).toBe("in_progress");
  });

  it("is done once at least one witness is added", () => {
    expect(getWitnessesStatus(withWitnesses("yes", [witness()]))).toBe("done");
  });
});

function withAccount(account: Incident["account"]): Incident {
  return { ...incident, account } as Incident;
}

describe("getAccountStatus", () => {
  it("is needed before the user has written anything or drafted", () => {
    expect(getAccountStatus(withAccount({ userWords: "", confirmed: false }))).toBe("needed");
  });

  it("is in_progress once the user has written something", () => {
    expect(getAccountStatus(withAccount({ userWords: "I was hit from behind.", confirmed: false }))).toBe("in_progress");
  });

  it("is in_progress once drafted but not confirmed", () => {
    const draft = {
      account: "Account text.",
      damageSchedule: [],
      missingItems: [],
      consistencyWarnings: [],
      questionsForUser: [],
      model: "mock",
      draftedAt: new Date().toISOString(),
    };
    expect(getAccountStatus(withAccount({ userWords: "I was hit from behind.", draft, confirmed: false }))).toBe("in_progress");
  });

  it("is done once the account is confirmed", () => {
    expect(getAccountStatus(withAccount({ userWords: "I was hit from behind.", finalText: "Account text.", confirmed: true }))).toBe("done");
  });
});
