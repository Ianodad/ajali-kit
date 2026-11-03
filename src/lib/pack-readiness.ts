import type { ExtractedField, Incident, OtherParty, Photo } from "./types";

// S17 "Claim pack" readiness (SPEC F9 step 1) and the PDF's own "Checklist of
// documents the insurer may ask for" (F9 PDF item 11) share this one list of
// rules, so the screen and the pack can never disagree about what is
// outstanding.
export interface ReadinessItem {
  key: string;
  label: string;
  met: boolean;
  // Hub section slug to send the user to for an "Add" link. Missing for
  // "registration": there is no My vehicle form yet in this build (SPEC S03
  // is not built in Phase 0 to 6), so the pack screen fixes it inline instead
  // of linking to a page that does not exist.
  fixHref?: string;
}

const DAMAGE_PHOTO_CATEGORIES: Photo["category"][] = ["own_damage", "other_damage"];

// A field only counts as "on file" once the user actually confirmed it (same
// gate pack-data.ts uses for what shows in the PDF, SPEC F9 item 8), not
// merely because Muse Spark extracted something at some confidence level.
function isConfirmed(field: ExtractedField | undefined): boolean {
  return Boolean(field?.userConfirmed && field.value.trim() !== "");
}

// A driver who refused to share means insurance genuinely is not on file,
// not that the item is satisfied: refusal is tracked separately (it already
// drives the "refused to share" note in the pack), so it must not mark
// insurance as present when it is not (Codex review finding 1).
function hasConfirmedInsurance(party: OtherParty): boolean {
  return isConfirmed(party.insurance?.insurer) || isConfirmed(party.insurance?.policyOrCertificateNo);
}

function hasConfirmedLicence(party: OtherParty): boolean {
  return isConfirmed(party.driver.licenceNumber);
}

// There is no separate "logbook photo" flag on OtherParty (SPEC section 7),
// so a confirmed vehicle make or model is the same on-file signal
// claim-summary.ts's logbookOnFile already uses for this party.
function hasConfirmedLogbook(party: OtherParty): boolean {
  return isConfirmed(party.vehicle.make) || isConfirmed(party.vehicle.model);
}

// SPEC F9 step 1: "Required for Generate: at least 1 damage photo, incident
// date/time and location text, own vehicle registration, confirmed account."
export function getRequiredItems(incident: Incident, photos: Photo[]): ReadinessItem[] {
  return [
    {
      key: "damage_photo",
      label: "At least one damage photo",
      met: photos.some((photo) => DAMAGE_PHOTO_CATEGORIES.includes(photo.category)),
      fixHref: "photos",
    },
    {
      key: "date_location",
      label: "Incident date, time and location",
      met: Boolean(incident.occurredAt) && incident.location.text.trim() !== "",
      fixHref: "basics",
    },
    {
      key: "registration",
      label: "Your vehicle's registration",
      met: incident.ownVehicle.registration.trim() !== "",
    },
    {
      key: "account_confirmed",
      label: "Your confirmed account",
      met: incident.account.confirmed,
      fixHref: "account",
    },
  ];
}

// SPEC F9 PDF item 11, reused as the S17 "optional items" list. Items only
// appear once they are relevant: a police item always applies, other-party
// and witness items only once the user has said Yes to those gates (F5/F7).
export function getChecklistItems(incident: Incident): ReadinessItem[] {
  const items: ReadinessItem[] = [
    { key: "ob_number", label: "Police OB number", met: Boolean(incident.police.obNumber), fixHref: "police" },
    { key: "police_abstract", label: "Police abstract", met: incident.police.abstractObtained, fixHref: "police" },
  ];

  if (incident.otherPartyInvolved === "yes") {
    const parties = incident.otherParties;
    items.push({
      key: "other_party_confirmed",
      label: "Other party's details confirmed",
      met: parties.length > 0 && parties.every((party) => party.confirmed),
      fixHref: "other-party",
    });
    items.push({
      key: "other_party_insurance",
      label: "Other party's insurance on file",
      met: parties.length > 0 && parties.every(hasConfirmedInsurance),
      fixHref: "other-party",
    });
    items.push({
      key: "other_party_licence",
      label: "Other party's licence copy on file",
      met: parties.length > 0 && parties.every(hasConfirmedLicence),
      fixHref: "other-party",
    });
    items.push({
      key: "other_party_logbook",
      label: "Other party's logbook copy on file",
      met: parties.length > 0 && parties.every(hasConfirmedLogbook),
      fixHref: "other-party",
    });
  }

  if (incident.witnessesPresent === "yes") {
    items.push({
      key: "witness_statement",
      label: "Witness statement",
      met: incident.witnesses.length > 0,
      fixHref: "witnesses",
    });
  }

  return items;
}

export function canGeneratePack(incident: Incident, photos: Photo[]): boolean {
  return getRequiredItems(incident, photos).every((item) => item.met);
}
