"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { BottomActionBar } from "@/components/bottom-action-bar";
import { StatusChip } from "@/components/status-chip";
import { listIncidents } from "@/lib/incidents";
import { hasCompletedOnboarding } from "@/lib/onboarding";
import { isStorageAvailable } from "@/lib/storage-check";
import type { Incident } from "@/lib/types";

export default function HomePage() {
  const router = useRouter();
  const [incidents, setIncidents] = useState<Incident[] | null>(null);
  const [showOnboardingRedirect, setShowOnboardingRedirect] = useState(true);
  const [storageUnavailable, setStorageUnavailable] = useState(false);

  // F1: a returning user skips onboarding; a first-time user is sent there
  // instead of seeing Home at all.
  useEffect(() => {
    if (!hasCompletedOnboarding()) {
      router.replace("/onboarding");
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- whether onboarding is done is only knowable once this mounts in the browser (localStorage).
    setShowOnboardingRedirect(false);
  }, [router]);

  useEffect(() => {
    listIncidents()
      .then(setIncidents)
      .catch(() => setIncidents([]));
    isStorageAvailable().then((available) => setStorageUnavailable(!available));
  }, []);

  if (showOnboardingRedirect) {
    return null;
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="bg-navy px-4 py-6 text-white">
        <h1 className="text-xl font-semibold">Ajali Kit</h1>
      </header>
      <main className="flex-1 space-y-6 p-4 pb-24">
        {storageUnavailable ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
            This browser can&apos;t save your claim. Use a normal tab.
          </div>
        ) : null}
        <Link
          href="/safety"
          className="block w-full rounded-xl bg-emergency px-4 py-5 text-left text-white shadow"
        >
          <span className="block text-lg font-semibold">I have had an accident</span>
          <span className="block text-sm text-white/80">Start a new claim pack</span>
        </Link>

        <section>
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">Your claims</h2>
          {incidents === null ? (
            <p className="text-sm text-muted-foreground">Loading.</p>
          ) : incidents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No incidents yet.</p>
          ) : (
            <ul className="space-y-2">
              {incidents.map((incident) => (
                <li key={incident.id}>
                  <Link
                    href={`/incident/${incident.id}`}
                    className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-border bg-card p-3"
                  >
                    <div>
                      <p className="font-medium">{incident.reference}</p>
                      <p className="text-sm text-muted-foreground">
                        {incident.location.text || "Location not set"}
                      </p>
                    </div>
                    <StatusChip status={incident.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
      <BottomActionBar>
        <Link href="/vehicle" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
          My vehicle
        </Link>
        <span className="text-muted-foreground">·</span>
        <Link href="/settings" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
          Settings
        </Link>
      </BottomActionBar>
    </div>
  );
}
