import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it } from "vitest";

import { db } from "../db";
import { getOwnVehicleSettings, saveOwnVehicleSettings } from "../vehicle-settings";

beforeEach(async () => {
  await db.settings.clear();
});

describe("vehicle settings", () => {
  it("returns undefined before anything is saved", async () => {
    expect(await getOwnVehicleSettings()).toBeUndefined();
  });

  it("round-trips a saved vehicle profile", async () => {
    const vehicle = { registration: "KDA 123A", make: "Toyota", model: "Axio", colour: "Silver", insurer: "your insurer", policyNumber: "POL-1" };
    await saveOwnVehicleSettings(vehicle);
    expect(await getOwnVehicleSettings()).toEqual(vehicle);
  });

  it("overwrites the previous profile on a second save", async () => {
    await saveOwnVehicleSettings({ registration: "KDA 123A" });
    await saveOwnVehicleSettings({ registration: "KBZ 456B" });
    expect(await getOwnVehicleSettings()).toEqual({ registration: "KBZ 456B" });
  });
});
