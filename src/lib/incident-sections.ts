import { canGeneratePack } from "./pack-readiness";
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

const DAMAGE_PHOTO_CATEGORIES: Photo["category"][] = ["own_damage", "other_damage"];

// SPEC F4 step 7: "When all items on all damage photos are confirmed or
// deleted, 'Damage review' is ticked on the hub." "in_progress" once at
// least one damage photo has been analysed; "needed" before that (including
// when there are no damage photos yet to analyse).
export function getDamageReviewStatus(photos: Photo[]): SectionStatus {
  const damagePhotos = photos.filter((p) => DAMAGE_PHOTO_CATEGORIES.includes(p.category));
  if (damagePhotos.length === 0) return "needed";

  const analysedPhotos = damagePhotos.filter((p) => p.analysis);
  if (analysedPhotos.length === 0) return "needed";

  const allItems = analysedPhotos.flatMap((p) => p.analysis?.items ?? []);
  const allResolved = allItems.every((item) => item.status === "confirmed" || item.status === "deleted");
  const allPhotosAnalysed = analysedPhotos.length === damagePhotos.length;

  return allPhotosAnalysed && allResolved ? "done" : "in_progress";
}

// F5: "No" or "Not sure" closes the section with no vehicle to fill in; "Yes"
// needs at least one confirmed party ("These details are correct" ticked).
export function getOtherPartyStatus(incident: Incident): SectionStatus {
  if (incident.otherPartyInvolved === null) return "needed";
  if (incident.otherPartyInvolved === "no") return "done";
  if (incident.otherParties.length === 0) return "in_progress";
  return incident.otherParties.every((party) => party.confirmed) ? "done" : "in_progress";
}

// F6: every field is allowed to stay empty (A7), so "done" tracks whether the
// user has been through the section (PoliceReport.reviewed), not whether any
// particular field is filled.
export function getPoliceReportStatus(incident: Incident): SectionStatus {
  if (incident.police.reviewed) return "done";
  const touched = Boolean(incident.police.station || incident.police.obNumber || incident.police.reportedAt || incident.police.officerName);
  return touched ? "in_progress" : "needed";
}

// F7: "No" closes the section with no witnesses to list; "Yes" needs at
// least one witness card.
export function getWitnessesStatus(incident: Incident): SectionStatus {
  if (incident.witnessesPresent === null) return "needed";
  if (incident.witnessesPresent === "no") return "done";
  return incident.witnesses.length > 0 ? "done" : "in_progress";
}

// F8: "needed" until there is at least a draft to work with, "in_progress"
// once the user has written something or drafted with AI but not yet ticked
// the declaration, "done" once the account is confirmed (SPEC 5 F8 step 5).
export function getAccountStatus(incident: Incident): SectionStatus {
  if (incident.account.confirmed) return "done";
  if (incident.account.userWords.trim() !== "" || incident.account.draft) return "in_progress";
  return "needed";
}

// F9 step 2/5: "done" once the pack has actually been generated (the
// Incident's own status flips to "exported" then, SPEC section 7);
// "in_progress" once every required item is met, so Generate is reachable,
// even before the user taps it.
export function getPackStatus(incident: Incident, photos: Photo[]): SectionStatus {
  if (incident.status === "exported") return "done";
  return canGeneratePack(incident, photos) ? "in_progress" : "needed";
}

export function getSectionStatus(slug: SectionSlug, incident: Incident, photos: Photo[]): SectionStatus {
  if (slug === "photos") return getPhotoChecklistStatus(photos);
  if (slug === "damage") return getDamageReviewStatus(photos);
  if (slug === "other-party") return getOtherPartyStatus(incident);
  if (slug === "police") return getPoliceReportStatus(incident);
  if (slug === "witnesses") return getWitnessesStatus(incident);
  if (slug === "account") return getAccountStatus(incident);
  return getPackStatus(incident, photos);
}
