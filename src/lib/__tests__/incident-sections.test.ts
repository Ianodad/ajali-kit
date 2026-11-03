import { describe, expect, it } from "vitest";

import { getPhotoChecklistStatus, getSectionStatus } from "../incident-sections";
import type { Incident, Photo } from "../types";

function photo(category: Photo["category"]): Photo {
  return {
    id: crypto.randomUUID(),
    incidentId: "inc-1",
    category,
    blobId: crypto.randomUUID(),
    thumbBlobId: crypto.randomUUID(),
    width: 100,
    height: 100,
    takenAt: new Date().toISOString(),
  };
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
    expect(getSectionStatus("damage", incident, [])).toBe("needed");
    expect(getSectionStatus("pack", incident, [photo("scene")])).toBe("needed");
  });
});
