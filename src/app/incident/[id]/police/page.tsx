"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { BottomActionBar } from "@/components/bottom-action-bar";
import { Button } from "@/components/ui/button";
import { processImage } from "@/lib/image";
import { getIncident, savePhoto, updateIncident, updatePoliceReport } from "@/lib/incidents";
import type { Incident } from "@/lib/types";
import { useFlushOnUnmount } from "@/lib/use-flush-on-unmount";

const AUTOSAVE_DELAY_MS = 600;

export default function PoliceSectionPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [incident, setIncident] = useState<Incident | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    getIncident(params.id).then((found) => setIncident(found ?? null));
  }, [params.id]);

  // Autosave, same pattern as Incident basics: typed fields persist on their
  // own. A5's "OB number can be saved empty" means there is nothing to
  // validate here before saving.
  useEffect(() => {
    if (!incident) return;
    const timeout = setTimeout(() => {
      updateIncident(incident.id, { police: incident.police });
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [incident]);

  // Flushes on unmount, so leaving via the header's Back link within the
  // autosave's 600ms window does not lose the last edit (P4.R finding 1);
  // Save already flushes explicitly before it navigates.
  useFlushOnUnmount(incident, (current) => {
    if (!current) return;
    void updateIncident(current.id, { police: current.police });
  });

  function updatePolice(changes: Partial<Incident["police"]>) {
    setIncident((prev) => (prev ? { ...prev, police: { ...prev.police, ...changes } } : prev));
  }

  async function handleAbstractPhoto(file: File | undefined) {
    if (!file || !incident) return;
    setPhotoError(null);
    try {
      const processed = await processImage(file);
      const photo = await savePhoto({
        incidentId: incident.id,
        category: "document",
        docType: "police_abstract",
        blob: processed.blob,
        thumbBlob: processed.thumbBlob,
        width: processed.width,
        height: processed.height,
        lat: incident.location.lat,
        lng: incident.location.lng,
      });
      updatePolice({ abstractPhotoId: photo.id });
    } catch {
      setPhotoError("Could not save that photo. Your phone may be out of space.");
    }
  }

  async function handleSave() {
    if (!incident || saving) return;
    setSaving(true);
    // Set reviewed:true in local state too, not just the direct DB write
    // below: the flush-on-unmount that fires when router.push unmounts this
    // page writes whatever is in local state, so leaving it unaware of the
    // Save would silently overwrite reviewed:true back to false right after
    // (browser-run bug c).
    const police = { ...incident.police, reviewed: true };
    setIncident((prev) => (prev ? { ...prev, police } : prev));
    await updatePoliceReport(incident.id, police);
    router.push(`/incident/${incident.id}`);
  }

  if (incident === undefined) {
    return <p className="p-4 text-sm text-muted-foreground">Loading.</p>;
  }
  if (incident === null) {
    return <p className="p-4 text-sm text-muted-foreground">Incident not found.</p>;
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="bg-navy px-4 py-6 text-white">
        <Link href={`/incident/${incident.id}`} className="text-sm text-white/70 underline-offset-4 hover:underline">
          ‹ Back to incident
        </Link>
        <h1 className="mt-1 text-lg font-semibold">Police report</h1>
      </header>

      <main className="flex-1 space-y-4 p-4 pb-28">
        <details className="rounded-lg border border-border bg-card p-3" open>
          <summary className="cursor-pointer text-sm font-medium">General guidance. Check with your insurer.</summary>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-muted-foreground">
            <li>Report the accident at the nearest police station, usually the one covering where it happened.</li>
            <li>You will get an OB (Occurrence Book) number. Write it down.</li>
            <li>Insurers usually ask for a police abstract. You request it later from the same station.</li>
            <li>Take your ID, licence and vehicle details with you.</li>
          </ul>
        </details>

        <div className="space-y-1">
          <label className="block text-sm font-medium" htmlFor="station">
            Police station
          </label>
          <input
            id="station"
            className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
            value={incident.police.station ?? ""}
            onChange={(e) => updatePolice({ station: e.target.value })}
          />
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium" htmlFor="obNumber">
            OB number
          </label>
          <input
            id="obNumber"
            className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
            placeholder="Leave blank if you don't have it yet"
            value={incident.police.obNumber ?? ""}
            onChange={(e) => updatePolice({ obNumber: e.target.value })}
          />
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium" htmlFor="reportedAt">
            Date reported
          </label>
          <input
            id="reportedAt"
            type="date"
            className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
            value={incident.police.reportedAt ?? ""}
            onChange={(e) => updatePolice({ reportedAt: e.target.value })}
          />
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium" htmlFor="officerName">
            Officer&apos;s name (optional)
          </label>
          <input
            id="officerName"
            className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
            value={incident.police.officerName ?? ""}
            onChange={(e) => updatePolice({ officerName: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Police abstract obtained?</p>
          <div className="flex gap-2">
            {[
              { value: true, label: "Yes" },
              { value: false, label: "Not yet" },
            ].map((option) => (
              <button
                key={option.label}
                type="button"
                onClick={() => updatePolice({ abstractObtained: option.value })}
                className={`min-h-10 flex-1 rounded-lg border px-3 py-2 text-sm ${
                  incident.police.abstractObtained === option.value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          {!incident.police.abstractObtained ? (
            <p className="text-xs text-muted-foreground">No OB number yet is fine. The claim pack will flag the abstract as outstanding.</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Abstract photo (optional)</p>
          {photoError ? <p className="text-sm text-destructive">{photoError}</p> : null}
          {incident.police.abstractPhotoId ? <p className="text-sm text-muted-foreground">Photo saved.</p> : null}
          <div className="flex flex-col items-start gap-1">
            <Button type="button" variant="outline" size="sm" onClick={() => cameraInputRef.current?.click()}>
              Take photo
            </Button>
            <button type="button" className="text-xs text-primary underline-offset-4 hover:underline" onClick={() => galleryInputRef.current?.click()}>
              Choose from gallery
            </button>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                void handleAbstractPhoto(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                void handleAbstractPhoto(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>
        </div>
      </main>

      <BottomActionBar>
        <Button type="button" className="w-full" disabled={saving} onClick={handleSave}>
          Save
        </Button>
      </BottomActionBar>
    </div>
  );
}
