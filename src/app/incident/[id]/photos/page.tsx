"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { BottomActionBar } from "@/components/bottom-action-bar";
import { PhotoThumb } from "@/components/photo-thumb";
import { Button } from "@/components/ui/button";
import { processImage } from "@/lib/image";
import { getIncident, listPhotos, savePhoto } from "@/lib/incidents";
import { SHOT_LIST } from "@/lib/shot-list";
import type { Incident, Photo, PhotoCategory } from "@/lib/types";

interface PendingCapture {
  category: PhotoCategory;
  file: File;
  previewUrl: string;
}

export default function PhotosSectionPage() {
  const params = useParams<{ id: string }>();
  const [incident, setIncident] = useState<Incident | null | undefined>(undefined);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [pending, setPending] = useState<PendingCapture | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    getIncident(params.id).then((found) => setIncident(found ?? null));
    listPhotos(params.id).then(setPhotos);
  }, [params.id]);

  function handleFileSelected(category: PhotoCategory, file: File | undefined) {
    if (!file) return;
    setError(null);
    const previewUrl = URL.createObjectURL(file);
    setPending({ category, file, previewUrl });
  }

  function handleRetake() {
    if (pending) URL.revokeObjectURL(pending.previewUrl);
    setPending(null);
  }

  async function handleUsePhoto() {
    if (!pending || !incident) return;
    setSaving(true);
    setError(null);
    try {
      const processed = await processImage(pending.file);
      const photo = await savePhoto({
        incidentId: incident.id,
        category: pending.category,
        blob: processed.blob,
        thumbBlob: processed.thumbBlob,
        width: processed.width,
        height: processed.height,
        lat: incident.location.lat,
        lng: incident.location.lng,
      });
      setPhotos((prev) => [...prev, photo]);
      URL.revokeObjectURL(pending.previewUrl);
      setPending(null);
    } catch {
      setError("Could not save that photo. Your phone may be out of space.");
    } finally {
      setSaving(false);
    }
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
        <h1 className="mt-1 text-lg font-semibold">Photos</h1>
      </header>
      <main className="flex-1 space-y-3 p-4 pb-28">
        {error ? <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
        <ul className="space-y-2">
          {SHOT_LIST.map((shot) => {
            const shotPhotos = photos.filter((p) => p.category === shot.category);
            const hasPhoto = shotPhotos.length > 0;
            return (
              <li key={shot.category} className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{shot.title}</p>
                      {hasPhoto ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                          Done
                        </span>
                      ) : null}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {shotPhotos.length} {shotPhotos.length === 1 ? "photo" : "photos"}
                      {shot.minCount > 1 ? ` of ${shot.minCount} needed` : shot.required ? "" : " (optional)"}
                    </p>
                  </div>
                  <Button type="button" variant="outline" onClick={() => inputRefs.current[shot.category]?.click()}>
                    Add photo
                  </Button>
                  <input
                    ref={(el) => {
                      inputRefs.current[shot.category] = el;
                    }}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => {
                      handleFileSelected(shot.category, e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </div>
                {shotPhotos.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {shotPhotos.map((photo) => (
                      <PhotoThumb key={photo.id} blobId={photo.thumbBlobId} alt={shot.title} />
                    ))}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </main>

      {pending ? (
        <div className="fixed inset-0 z-20 flex flex-col bg-black/90 p-4">
          <div className="flex-1 overflow-hidden rounded-lg">
            {/* eslint-disable-next-line @next/next/no-img-element -- object URL, not a static asset */}
            <img src={pending.previewUrl} alt="Preview" className="h-full w-full object-contain" />
          </div>
          <div className="mt-4 flex gap-3">
            <Button type="button" variant="outline" className="flex-1" onClick={handleRetake} disabled={saving}>
              Retake
            </Button>
            <Button type="button" className="flex-1" onClick={handleUsePhoto} disabled={saving}>
              {saving ? "Saving." : "Use photo"}
            </Button>
          </div>
        </div>
      ) : null}

      <BottomActionBar>
        <Button type="button" className="w-full" disabled title="Built in a later phase">
          Check damage with AI
        </Button>
      </BottomActionBar>
    </div>
  );
}
