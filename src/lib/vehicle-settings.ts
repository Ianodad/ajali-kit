import { db } from "./db";
import type { OwnVehicle } from "./types";

// SPEC S03 "My vehicle": one saved profile, not tied to any incident, used as
// the default OwnVehicle snapshot for every new incident (createIncident
// already takes an ownVehicle input; the safety-check flow supplies it from
// here so the pack screen's inline registration fix is no longer the only
// way to get it filled in).
const OWN_VEHICLE_SETTING_ID = "own-vehicle";

export async function getOwnVehicleSettings(): Promise<OwnVehicle | undefined> {
  const row = await db.settings.get(OWN_VEHICLE_SETTING_ID);
  return row?.value as OwnVehicle | undefined;
}

export async function saveOwnVehicleSettings(vehicle: OwnVehicle): Promise<void> {
  await db.settings.put({ id: OWN_VEHICLE_SETTING_ID, value: vehicle });
}
