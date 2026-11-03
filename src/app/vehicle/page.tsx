"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { BottomActionBar } from "@/components/bottom-action-bar";
import { Button } from "@/components/ui/button";
import type { OwnVehicle } from "@/lib/types";
import { getOwnVehicleSettings, saveOwnVehicleSettings } from "@/lib/vehicle-settings";

// S03 "My vehicle", SPEC section 6. Scoped to the fields that matter for a
// claim pack and fit comfortably in the hackathon's timebox: registration,
// make, model, colour, insurer (free text, no insurer branding anywhere else
// in the app) and policy number. Year, owner name/phone and a claims email
// are in SPEC's own S03 wireframe but are cut here (logged in PROGRESS.md):
// none of them are read by anything else this build sends to the model or
// the PDF, unlike registration (pack readiness, A5) and insurer/policy
// (shown on the PDF's cover and summary).
//
// Saved once, locally, and used as the default OwnVehicle snapshot for every
// new incident (see the safety-check page), not retroactively applied to
// incidents that already exist.
export default function VehiclePage() {
  const [vehicle, setVehicle] = useState<OwnVehicle | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getOwnVehicleSettings().then((found) => setVehicle(found ?? { registration: "" }));
  }, []);

  function update(changes: Partial<OwnVehicle>) {
    setSaved(false);
    setVehicle((prev) => (prev ? { ...prev, ...changes } : prev));
  }

  async function handleSave() {
    if (!vehicle || saving) return;
    setSaving(true);
    await saveOwnVehicleSettings(vehicle);
    setSaving(false);
    setSaved(true);
  }

  if (vehicle === undefined) {
    return <p className="p-4 text-sm text-muted-foreground">Loading.</p>;
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="bg-navy px-4 py-6 text-white">
        <Link href="/" className="text-sm text-white/70 underline-offset-4 hover:underline">
          ‹ Back to Home
        </Link>
        <h1 className="mt-1 text-lg font-semibold">My vehicle</h1>
      </header>

      <main className="flex-1 space-y-4 p-4 pb-28">
        <p className="text-sm text-muted-foreground">
          Save your vehicle details once. New claims start with these already filled in.
        </p>

        <div className="space-y-1">
          <label className="block text-sm font-medium" htmlFor="registration">
            Registration number
          </label>
          <input
            id="registration"
            className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
            placeholder="KDA 123A"
            value={vehicle.registration}
            onChange={(e) => update({ registration: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="block text-sm font-medium" htmlFor="make">
              Make
            </label>
            <input
              id="make"
              className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
              placeholder="Toyota"
              value={vehicle.make ?? ""}
              onChange={(e) => update({ make: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium" htmlFor="model">
              Model
            </label>
            <input
              id="model"
              className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
              placeholder="Axio"
              value={vehicle.model ?? ""}
              onChange={(e) => update({ model: e.target.value })}
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium" htmlFor="colour">
            Colour
          </label>
          <input
            id="colour"
            className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
            value={vehicle.colour ?? ""}
            onChange={(e) => update({ colour: e.target.value })}
          />
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium" htmlFor="insurer">
            Insurer
          </label>
          <input
            id="insurer"
            className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
            placeholder="Your insurer"
            value={vehicle.insurer ?? ""}
            onChange={(e) => update({ insurer: e.target.value })}
          />
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium" htmlFor="policyNumber">
            Policy number
          </label>
          <input
            id="policyNumber"
            className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
            value={vehicle.policyNumber ?? ""}
            onChange={(e) => update({ policyNumber: e.target.value })}
          />
        </div>

        {saved ? <p className="text-sm text-muted-foreground">Saved.</p> : null}
      </main>

      <BottomActionBar>
        <Button type="button" className="w-full" disabled={saving} onClick={handleSave}>
          Save
        </Button>
      </BottomActionBar>
    </div>
  );
}
