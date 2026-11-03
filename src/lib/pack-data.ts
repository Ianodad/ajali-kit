import { toLocalInputValue } from "./datetime";
import type { DamageOverlayItem } from "./draw-damage-overlay";
import { getChecklistItems, getRequiredItems, type ReadinessItem } from "./pack-readiness";
import type { DamageAnalysis, DamageType, ExtractedField, Incident, Photo, Severity } from "./types";

const DAMAGE_PHOTO_CATEGORIES: Photo["category"][] = ["own_damage", "other_damage"];
// SPEC F9 item 7: "Other photos (scene, plate, other vehicle)." Own vehicle
// wide shots are shown the same way (plain, no overlay), since F9 does not
// list a separate slot for them and they are not damage photos.
const OTHER_PHOTO_CATEGORIES: Photo["category"][] = ["scene", "own_vehicle", "other_vehicle", "plate", "other"];

export interface PackDamagePhoto {
  photoId: string;
  photoRef: string; // "photo-1", matches the numbering in the damage schedule
  vehicle: "own" | "other";
  blobId: string;
  width: number;
  height: number;
  takenAt: string;
  vehicleMask?: DamageAnalysis["vehicleMask"];
  // Confirmed items only, each keeping its colorIndex from the full
  // (including deleted) items array, so a pin's colour and number match the
  // S11 review screen exactly (SPEC A9).
  items: DamageOverlayItem[];
}

export interface PackOtherPhoto {
  photoId: string;
  blobId: string;
  width: number;
  height: number;
  takenAt: string;
}

export interface PackDamageScheduleRow {
  vehicle: "own" | "other";
  part: string;
  damageType: DamageType;
  severity: Severity;
  photoRef: string;
}

export interface PackOtherPartyView {
  vehicleRegistration?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleColour?: string;
  driverName?: string;
  driverPhone?: string;
  licenceNumber?: string;
  licenceExpiry?: string;
  ownerName?: string;
  ownerPhone?: string;
  insurer?: string;
  policyOrCertificateNo?: string;
  insuranceExpiry?: string;
  refusedToShare: boolean;
  notes?: string;
}

export interface PackWitnessView {
  name: string;
  phone?: string; // only present with consent (SPEC F7/F9 item 10)
  statement: string;
}

export interface ClaimPackData {
  reference: string;
  generatedAt: string;
  occurredAtLocal: string;
  locationText: string;
  locationCoords?: { lat: number; lng: number };
  weather?: Incident["conditions"]["weather"];
  light?: Incident["conditions"]["light"];
  road: string[];
  anyoneInjured: boolean | null;
  ownRegistration: string;
  claimantName?: string;
  accountText: string;
  accountConfirmedAt?: string;
  damageSchedule: PackDamageScheduleRow[];
  damagePhotos: PackDamagePhoto[];
  otherPhotos: PackOtherPhoto[];
  otherPartyInvolved: Incident["otherPartyInvolved"];
  otherParties: PackOtherPartyView[];
  police: { station?: string; obNumber?: string; reportedAt?: string; officerName?: string; abstractObtained: boolean };
  witnessesPresent: Incident["witnessesPresent"];
  witnesses: PackWitnessView[];
  checklist: ReadinessItem[];
  requiredItems: ReadinessItem[];
  outstandingLabels: string[];
}

// Only fields the user confirmed go in the pack (SPEC F9 item 8): either a
// real scan match, or hand-typed (manualExtractedField marks it confirmed
// immediately), never a low-confidence extraction the user never reviewed.
function confirmedValue(field?: ExtractedField): string | undefined {
  return field?.userConfirmed ? field.value : undefined;
}

export function buildClaimPackData(incident: Incident, photos: Photo[], generatedAt: string): ClaimPackData {
  const damagePhotos: PackDamagePhoto[] = photos
    .filter((photo) => DAMAGE_PHOTO_CATEGORIES.includes(photo.category))
    .map((photo, index) => ({
      photoId: photo.id,
      photoRef: `photo-${index + 1}`,
      vehicle: photo.category === "own_damage" ? "own" : "other",
      blobId: photo.blobId,
      width: photo.width,
      height: photo.height,
      takenAt: photo.takenAt,
      vehicleMask: photo.analysis?.vehicleMask,
      items: (photo.analysis?.items ?? [])
        .map((item, colorIndex) => ({ item, colorIndex }))
        .filter((entry) => entry.item.status === "confirmed"),
    }));

  const damageSchedule: PackDamageScheduleRow[] = damagePhotos.flatMap((photo) =>
    photo.items.map(({ item }) => ({
      vehicle: photo.vehicle,
      part: item.part,
      damageType: item.damageType,
      severity: item.severity,
      photoRef: photo.photoRef,
    })),
  );

  const otherPhotos: PackOtherPhoto[] = photos
    .filter((photo) => OTHER_PHOTO_CATEGORIES.includes(photo.category))
    .map((photo) => ({ photoId: photo.id, blobId: photo.blobId, width: photo.width, height: photo.height, takenAt: photo.takenAt }));

  const otherParties: PackOtherPartyView[] = incident.otherParties.map((party) => ({
    vehicleRegistration: confirmedValue(party.vehicle.registration),
    vehicleMake: confirmedValue(party.vehicle.make),
    vehicleModel: confirmedValue(party.vehicle.model),
    vehicleColour: party.vehicle.colour,
    driverName: confirmedValue(party.driver.name),
    driverPhone: party.driver.phone,
    licenceNumber: confirmedValue(party.driver.licenceNumber),
    licenceExpiry: confirmedValue(party.driver.licenceExpiry),
    ownerName: confirmedValue(party.owner?.name),
    ownerPhone: party.owner?.phone,
    insurer: confirmedValue(party.insurance?.insurer),
    policyOrCertificateNo: confirmedValue(party.insurance?.policyOrCertificateNo),
    insuranceExpiry: confirmedValue(party.insurance?.expiry),
    refusedToShare: party.refusedToShare,
    notes: party.notes,
  }));

  const witnesses: PackWitnessView[] = incident.witnesses.map((witness) => ({
    name: witness.name,
    phone: witness.consentToContact ? witness.phone : undefined,
    statement: witness.statement,
  }));

  const requiredItems = getRequiredItems(incident, photos);
  const checklist = getChecklistItems(incident);
  const outstandingLabels = [...requiredItems, ...checklist].filter((item) => !item.met).map((item) => item.label);

  return {
    reference: incident.reference,
    generatedAt,
    occurredAtLocal: toLocalInputValue(incident.occurredAt),
    locationText: incident.location.text,
    locationCoords:
      incident.location.lat !== undefined && incident.location.lng !== undefined
        ? { lat: incident.location.lat, lng: incident.location.lng }
        : undefined,
    weather: incident.conditions.weather,
    light: incident.conditions.light,
    road: incident.conditions.road ?? [],
    anyoneInjured: incident.anyoneInjured,
    ownRegistration: incident.ownVehicle.registration,
    claimantName: incident.ownVehicle.ownerName,
    accountText: incident.account.finalText ?? incident.account.userWords,
    accountConfirmedAt: incident.account.confirmedAt,
    damageSchedule,
    damagePhotos,
    otherPhotos,
    otherPartyInvolved: incident.otherPartyInvolved,
    otherParties,
    police: {
      station: incident.police.station,
      obNumber: incident.police.obNumber,
      reportedAt: incident.police.reportedAt,
      officerName: incident.police.officerName,
      abstractObtained: incident.police.abstractObtained,
    },
    witnessesPresent: incident.witnessesPresent,
    witnesses,
    checklist,
    requiredItems,
    outstandingLabels,
  };
}
