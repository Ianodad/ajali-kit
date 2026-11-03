import { describe, expect, it } from "vitest";

import { getDamageReviewStatus, getPhotoChecklistStatus, getSectionStatus } from "../incident-sections";
import type { DamageAnalysis, DamageItem, Incident, Photo } from "../types";

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

const incident = {
  id: "inc-1",
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

  it("is needed for sections not built yet", () => {
    expect(getSectionStatus("pack", incident, [photo("scene")])).toBe("needed");
  });

  it("delegates to the damage review status for the damage section", () => {
    const photos = [photo("own_damage", analysis([damageItem("pending")]))];
    expect(getSectionStatus("damage", incident, photos)).toBe("in_progress");
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
