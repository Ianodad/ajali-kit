"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { BottomActionBar } from "@/components/bottom-action-bar";
import { Button } from "@/components/ui/button";
import { createIncident } from "@/lib/incidents";
import { cn } from "@/lib/utils";
import { getOwnVehicleSettings } from "@/lib/vehicle-settings";

// S05 Safety check, SPEC section 5 (F2) and section 6. The incident is
// created only once the user continues from here, not on Home: section 5
// step 3 says the incident is created after the safety check.
export default function SafetyCheckPage() {
  const router = useRouter();
  const [hurt, setHurt] = useState<boolean | null>(null);
  const [creating, setCreating] = useState(false);

  async function handleContinue() {
    if (creating || hurt === null) return;
    setCreating(true);
    // S03 "My vehicle" (if saved) seeds the new incident's OwnVehicle snapshot,
    // so the pack screen's inline registration fix is no longer the only way
    // to get it filled in.
    const ownVehicle = await getOwnVehicleSettings();
    const incident = await createIncident({ anyoneInjured: hurt, ownVehicle });
    router.push(`/incident/${incident.id}/basics`);
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="bg-navy px-4 py-6 text-white">
        <h1 className="text-xl font-semibold">Are you safe?</h1>
      </header>
      <main className="flex-1 space-y-6 p-4 pb-28">
        <section className="space-y-3">
          <p className="font-medium">Is anyone hurt?</p>
          <div className="flex gap-3">
            <Button
              type="button"
              variant={hurt === true ? "default" : "outline"}
              className="h-14 flex-1 text-base"
              onClick={() => setHurt(true)}
            >
              Yes
            </Button>
            <Button
              type="button"
              variant={hurt === false ? "default" : "outline"}
              className="h-14 flex-1 text-base"
              onClick={() => setHurt(false)}
            >
              No
            </Button>
          </div>
        </section>

        {hurt === true ? (
          <section className="space-y-3 rounded-lg border border-emergency/30 bg-emergency/5 p-3">
            <p className="text-sm">
              Move to safety if you can. Don&apos;t move injured people.
            </p>
            <div className="flex gap-3">
              <a
                href="tel:999"
                className={cn(
                  "flex min-h-12 flex-1 items-center justify-center rounded-lg bg-emergency px-4 text-center font-semibold text-white",
                )}
              >
                Call 999
              </a>
              <a
                href="tel:112"
                className={cn(
                  "flex min-h-12 flex-1 items-center justify-center rounded-lg bg-emergency px-4 text-center font-semibold text-white",
                )}
              >
                Call 112
              </a>
            </div>
          </section>
        ) : null}

        {hurt === false ? (
          <section className="space-y-2 rounded-lg border border-border bg-card p-3 text-sm">
            <p>Turn on hazard lights.</p>
            <p>If it is safe, take photos before moving the cars.</p>
          </section>
        ) : null}
      </main>
      <BottomActionBar>
        <Button
          type="button"
          className="w-full"
          disabled={hurt === null || creating}
          onClick={handleContinue}
        >
          {hurt === true ? "Continue when safe" : "Continue"}
        </Button>
      </BottomActionBar>
    </div>
  );
}
