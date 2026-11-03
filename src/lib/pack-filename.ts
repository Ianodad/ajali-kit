import { toLocalInputValue } from "./datetime";
import type { Incident } from "./types";

// SPEC F10: "Download: saves Ajali-Kit-Claim-<reg>-<date>.pdf." The
// registration is stripped to letters and digits (phones and desktops both
// reject "/", and some reject spaces), and the date is the incident's own
// local date, not the generation date, so re-downloading the same incident
// keeps the same filename.
export function buildPackFileName(incident: Incident): string {
  const reg = incident.ownVehicle.registration.trim().replace(/[^A-Za-z0-9]+/g, "").toUpperCase();
  const date = toLocalInputValue(incident.occurredAt).slice(0, 10);
  return `Ajali-Kit-Claim-${reg || "UNKNOWN"}-${date}.pdf`;
}
