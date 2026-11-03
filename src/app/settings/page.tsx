"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { clearAllData } from "@/lib/incidents";

// S19 Settings, SPEC section 6: mock mode indicator (dev only), clear all
// data, about and privacy notice. The SPEC wireframe calls this a "mock mode
// toggle", but the client has no way to flip the server's AJALI_MOCK env
// var, so this shows it as a read-only indicator instead (CLAUDE.md task
// brief for this phase scopes it the same way); it reads a build-time
// NEXT_PUBLIC_MOCK_MODE mirror, since a server env var is invisible to the
// browser.
const SHOW_DEV = process.env.NEXT_PUBLIC_SHOW_DEV === "1";
const MOCK_MODE_INDICATOR = process.env.NEXT_PUBLIC_MOCK_MODE === "1";

export default function SettingsPage() {
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [creatingDemo, setCreatingDemo] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);

  async function handleDeleteAll() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await clearAllData();
      router.push("/");
    } catch {
      setDeleteError("Could not delete your data on this browser. Try again.");
    } finally {
      setDeleting(false);
    }
  }

  async function handleCreateDemoIncident() {
    if (creatingDemo) return;
    setCreatingDemo(true);
    setDemoError(null);
    try {
      const { createDemoIncident } = await import("@/lib/demo-incident");
      const incident = await createDemoIncident();
      router.push(`/incident/${incident.id}`);
    } catch {
      setDemoError("Could not create the demo incident on this browser.");
    } finally {
      setCreatingDemo(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="bg-navy px-4 py-6 text-white">
        <h1 className="text-xl font-semibold">Settings</h1>
      </header>

      <main className="flex-1 space-y-6 p-4 pb-10">
        {SHOW_DEV ? (
          <section className="space-y-2 rounded-lg border border-border bg-card p-3">
            <p className="text-sm font-medium">Dev tools</p>
            <p className="text-sm text-muted-foreground">Mock mode: {MOCK_MODE_INDICATOR ? "on" : "off"}</p>
            <Button type="button" variant="outline" disabled={creatingDemo} onClick={handleCreateDemoIncident}>
              {creatingDemo ? "Creating demo incident." : "Create demo incident"}
            </Button>
            {demoError ? <p className="text-sm text-destructive">{demoError}</p> : null}
            <p className="text-xs text-muted-foreground">
              Builds a complete incident with placeholder photos, for a reliable demo. No real photos or personal
              data.
            </p>
          </section>
        ) : null}

        <section className="space-y-2">
          <p className="text-sm font-medium">Your data</p>
          {confirmDelete ? (
            <div className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <p className="text-sm">Delete every incident, photo and saved setting on this device? This cannot be undone.</p>
              {deleteError ? <p className="text-sm text-destructive">{deleteError}</p> : null}
              <div className="flex gap-2">
                <Button type="button" variant="destructive" disabled={deleting} onClick={handleDeleteAll}>
                  Delete all data
                </Button>
                <Button type="button" variant="ghost" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button type="button" variant="outline" onClick={() => setConfirmDelete(true)}>
              Delete all data
            </Button>
          )}
        </section>

        <section className="space-y-2">
          <p className="text-sm font-medium">About</p>
          <p className="text-sm text-muted-foreground">
            Ajali Kit helps you build a motor insurance claim pack after an accident. It guides you through the
            photos and details your insurer needs, uses AI to mark damage on your photos, and puts it all in one PDF
            you share yourself. Ajali means accident in Swahili.
          </p>
        </section>

        <section className="space-y-2">
          <p className="text-sm font-medium">Privacy</p>
          <ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">
            <li>Your incidents, photos and documents stay on this phone, not on a server.</li>
            <li>A photo or document is sent to Meta&apos;s AI only to analyse it, and only once you agree.</li>
            <li>The AI never assesses cost or fault. Severity shown is indicative, and AI marks are a guide.</li>
            <li>A witness&apos;s phone number is only included in your claim pack if they agreed to be contacted.</li>
            <li>You control your data under the Kenya Data Protection Act, 2019, including deleting it any time.</li>
            <li>Deleting an incident, or using Delete all data above, removes its photos from this device too.</li>
          </ul>
        </section>
      </main>
    </div>
  );
}
