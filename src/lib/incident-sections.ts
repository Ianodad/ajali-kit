import { SHOT_LIST } from "./shot-list";
import type { Incident, Photo } from "./types";

// The incident hub checklist, per SPEC section 5 (F2) and section 6 (S07):
// "Photos, Damage review, Other party, Police report, Witnesses, My account, Claim pack."
export const INCIDENT_SECTIONS = [
  { slug: "photos", title: "Photos" },
  { slug: "damage", title: "Damage review" },
  { slug: "other-party", title: "Other party" },
  { slug: "police", title: "Police report" },
  { slug: "witnesses", title: "Witnesses" },
  { slug: "account", title: "My account" },
  { slug: "pack", title: "Claim pack" },
] as const;

export type SectionSlug = (typeof INCIDENT_SECTIONS)[number]["slug"];
export type SectionStatus = "needed" | "in_progress" | "done";

export const SECTION_STATUS_LABEL: Record<SectionStatus, string> = {
  needed: "Needed",
  in_progress: "In progress",
  done: "Done",
};

// Photos is "done" once every required shot-list row has its minimum count,
// "in_progress" once at least one photo exists, "needed" otherwise.
export function getPhotoChecklistStatus(photos: Photo[]): SectionStatus {
  if (photos.length === 0) return "needed";
  const countFor = (category: Photo["category"]) => photos.filter((p) => p.category === category).length;
  const allRequiredMet = SHOT_LIST.filter((shot) => shot.required).every((shot) => countFor(shot.category) >= shot.minCount);
  return allRequiredMet ? "done" : "in_progress";
}

// Sections beyond Photos are built in later phases (damage AI in Phase 3,
// other party/police/witnesses in Phase 4, account/pack in Phases 5 and 6),
// so there is no incident data yet to assess their status against.
export function getSectionStatus(slug: SectionSlug, incident: Incident, photos: Photo[]): SectionStatus {
  if (slug === "photos") return getPhotoChecklistStatus(photos);
  return "needed";
}
