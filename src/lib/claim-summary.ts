import { z } from "zod";

import { DAMAGE_TYPES, SEVERITIES } from "@/lib/schemas/damage-analysis";
import type { DamageType, Incident, Photo, Severity } from "@/lib/types";

// SPEC 8.5 / section 11: "Input is a JSON summary built by the app (no
// photos, no phone numbers, no ID numbers; send only what the draft needs)."
// This is the one place that summary is built, so every field below is a
// deliberate inclusion, not a leftover from the full Incident/OtherParty
// shape. Left out on purpose: own and other-party registrations (plates),
// driver/owner names, ID numbers, licence numbers, phone numbers, the actual
// police OB number, witness names and phone numbers, GPS coordinates, and
// every photo/blob. Where the model only needs to know a fact exists (an OB
// number, an insurance policy on file) it gets a boolean, not the value.

export interface ClaimSummaryDamageItem {
  vehicle: "own" | "other";
  photoRef: string;
  part: string;
  damageType: DamageType;
  severity: Severity;
  description: string;
}

export interface ClaimSummaryOtherParty {
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleColour?: string;
  insuranceOnFile: boolean;
  licenceOnFile: boolean;
  logbookOnFile: boolean;
  admissionNotes?: string;
  refusedToShare: boolean;
}

export interface ClaimSummary {
  occurredAt: string;
  locationText: string;
  weather?: "clear" | "rain" | "fog";
  light?: "day" | "dusk" | "night";
  road: string[];
  anyoneInjured: boolean | null;
  shortDescription?: string;
  userWords: string;
  ownVehicleMake?: string;
  ownVehicleModel?: string;
  ownVehicleColour?: string;
  damageItems: ClaimSummaryDamageItem[];
  otherPartyInvolved: "yes" | "no" | "unsure" | null;
  otherParties: ClaimSummaryOtherParty[];
  obNumberKnown: boolean;
  abstractObtained: boolean;
  witnessesPresent: "yes" | "no" | null;
  witnessStatements: string[];
}

const DAMAGE_PHOTO_CATEGORIES: Photo["category"][] = ["own_damage", "other_damage"];

// Free text (the user's own words, a party's notes, a witness statement) is
// not extracted field by field, so a phone number, ID number or plate typed
// into a sentence would otherwise reach the model unchanged (Codex review
// finding 1). These patterns catch the common Kenyan shapes; redaction, not
// perfect detection, since free text cannot be guaranteed clean.
const PHONE_PATTERN = /(?:\+254|0)[17]\d{8}\b/g;
const PLATE_PATTERN = /\bK[A-Z]{2}\s?\d{3}[A-Z]\b/gi;
const ID_NUMBER_PATTERN = /\b\d{7,8}\b/g;

export function redactFreeText(text: string): string {
  return text.replace(PHONE_PATTERN, "[redacted]").replace(PLATE_PATTERN, "[redacted]").replace(ID_NUMBER_PATTERN, "[redacted]");
}

export function buildClaimSummary(incident: Incident, photos: Photo[]): ClaimSummary {
  const damageItems: ClaimSummaryDamageItem[] = [];
  photos
    .filter((photo) => DAMAGE_PHOTO_CATEGORIES.includes(photo.category))
    .forEach((photo, index) => {
      const vehicle = photo.category === "own_damage" ? "own" : "other";
      const photoRef = `photo-${index + 1}`;
      for (const item of photo.analysis?.items ?? []) {
        if (item.status !== "confirmed") continue;
        damageItems.push({
          vehicle,
          photoRef,
          part: item.part,
          damageType: item.damageType,
          severity: item.severity,
          description: item.description,
        });
      }
    });

  return {
    occurredAt: incident.occurredAt,
    locationText: incident.location.text,
    weather: incident.conditions.weather,
    light: incident.conditions.light,
    road: incident.conditions.road ?? [],
    anyoneInjured: incident.anyoneInjured,
    shortDescription: incident.shortDescription ? redactFreeText(incident.shortDescription) : incident.shortDescription,
    userWords: redactFreeText(incident.account.userWords),
    ownVehicleMake: incident.ownVehicle.make,
    ownVehicleModel: incident.ownVehicle.model,
    ownVehicleColour: incident.ownVehicle.colour,
    damageItems,
    otherPartyInvolved: incident.otherPartyInvolved,
    otherParties: incident.otherParties.map((party) => ({
      vehicleMake: party.vehicle.make?.value,
      vehicleModel: party.vehicle.model?.value,
      vehicleColour: party.vehicle.colour,
      insuranceOnFile: Boolean(party.insurance?.insurer?.value || party.insurance?.policyOrCertificateNo?.value),
      licenceOnFile: Boolean(party.driver.licenceNumber?.value),
      logbookOnFile: Boolean(party.vehicle.make?.value || party.vehicle.model?.value),
      admissionNotes: party.notes ? redactFreeText(party.notes) : party.notes,
      refusedToShare: party.refusedToShare,
    })),
    obNumberKnown: Boolean(incident.police.obNumber),
    abstractObtained: incident.police.abstractObtained,
    witnessesPresent: incident.witnessesPresent,
    witnessStatements: incident.witnesses
      .map((witness) => witness.statement)
      .filter((statement) => statement.trim() !== "")
      .map(redactFreeText),
  };
}

export const ClaimSummaryDamageItemSchema = z.object({
  vehicle: z.enum(["own", "other"]),
  photoRef: z.string(),
  part: z.string(),
  damageType: z.enum(DAMAGE_TYPES),
  severity: z.enum(SEVERITIES),
  description: z.string(),
});

export const ClaimSummaryOtherPartySchema = z.object({
  vehicleMake: z.string().optional(),
  vehicleModel: z.string().optional(),
  vehicleColour: z.string().optional(),
  insuranceOnFile: z.boolean(),
  licenceOnFile: z.boolean(),
  logbookOnFile: z.boolean(),
  admissionNotes: z.string().optional(),
  refusedToShare: z.boolean(),
});

export const ClaimSummarySchema = z.object({
  occurredAt: z.string(),
  locationText: z.string(),
  weather: z.enum(["clear", "rain", "fog"]).optional(),
  light: z.enum(["day", "dusk", "night"]).optional(),
  road: z.array(z.string()),
  anyoneInjured: z.boolean().nullable(),
  shortDescription: z.string().optional(),
  userWords: z.string(),
  ownVehicleMake: z.string().optional(),
  ownVehicleModel: z.string().optional(),
  ownVehicleColour: z.string().optional(),
  damageItems: z.array(ClaimSummaryDamageItemSchema),
  otherPartyInvolved: z.enum(["yes", "no", "unsure"]).nullable(),
  otherParties: z.array(ClaimSummaryOtherPartySchema),
  obNumberKnown: z.boolean(),
  abstractObtained: z.boolean(),
  witnessesPresent: z.enum(["yes", "no"]).nullable(),
  witnessStatements: z.array(z.string()),
});
