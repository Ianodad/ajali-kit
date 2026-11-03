"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { BottomActionBar } from "@/components/bottom-action-bar";
import { PhotoThumb } from "@/components/photo-thumb";
import { Button } from "@/components/ui/button";
import { processImage } from "@/lib/image";
import { deletePhoto, getIncident, listPhotos, savePhoto } from "@/lib/incidents";
import { SHOT_LIST } from "@/lib/shot-list";
import type { Incident, Photo, PhotoCategory } from "@/lib/types";

const MANY_PHOTOS_WARNING_THRESHOLD = 30;
const DAMAGE_CATEGORIES: PhotoCategory[] = ["own_damage", "other_damage"];

interface PendingCapture {
  category: PhotoCategory;
  file: File;
  previewUrl: string;
}

interface QualityWarning {
  photo: Photo;
  message: string;
}

export default function PhotosSectionPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [incident, setIncident] = useState<Incident | null | undefined>(undefined);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [pending, setPending] = useState<PendingCapture | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qualityWarning, setQualityWarning] = useState<QualityWarning | null>(null);
  const cameraInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const galleryInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    getIncident(params.id)
      .then((found) => setIncident(found ?? null))
      .catch(() => setIncident(null));
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
      if (processed.looksTooDark) {
        setQualityWarning({ photo, message: "This photo looks too dark. Retake?" });
      } else if (processed.looksTooSmall) {
        setQualityWarning({ photo, message: "This photo looks too small. Retake?" });
      }
    } catch {
      setError("Could not save that photo. Your phone may be out of space.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRetakeQualityWarning() {
    if (!qualityWarning) return;
    await deletePhoto(qualityWarning.photo.id);
    setPhotos((prev) => prev.filter((p) => p.id !== qualityWarning.photo.id));
    setQualityWarning(null);
  }

  if (incident === undefined) {
    return <p className="p-4 text-sm text-muted-foreground">Loading.</p>;
  }
  if (incident === null) {
    return <p className="p-4 text-sm text-muted-foreground">Incident not found.</p>;
  }

  const pendingDamageCount = photos.filter((p) => DAMAGE_CATEGORIES.includes(p.category) && !p.analysis).length;

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
        {qualityWarning ? (
          <div className="flex items-center justify-between gap-3 rounded-lg bg-amber/15 p-3 text-sm">
            <p>{qualityWarning.message}</p>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setQualityWarning(null)}>
                Keep it
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={handleRetakeQualityWarning}>
                Retake
              </Button>
            </div>
          </div>
        ) : null}
        {photos.length > MANY_PHOTOS_WARNING_THRESHOLD ? (
          <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
            You have more than {MANY_PHOTOS_WARNING_THRESHOLD} photos. The claim pack PDF will be large.
          </p>
        ) : null}
        <ul className="space-y-2">
          {SHOT_LIST.map((shot) => {
            const shotPhotos = photos.filter((p) => p.category === shot.category);
            const needed = Math.max(shot.minCount, 1);
            const done = shotPhotos.length >= needed;
            return (
              <li key={shot.category} className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{shot.title}</p>
                      {done ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                          Done
                        </span>
                      ) : null}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {shotPhotos.length} {shotPhotos.length === 1 ? "photo" : "photos"}
                      {shot.minCount > 1 ? ` of ${shot.minCount} needed` : shot.required ? "" : " (optional)"}
                    </p>
                    {shotPhotos.length > 0 && DAMAGE_CATEGORIES.includes(shot.category) ? (
                      <p className="text-xs font-medium text-amber-700">Ready for AI check</p>
                    ) : null}
                  </div>
                  <div className="flex flex-col items-stretch gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => cameraInputRefs.current[shot.category]?.click()}
                    >
                      Take photo
                    </Button>
                    <button
                      type="button"
                      className="text-xs text-primary underline-offset-4 hover:underline"
                      onClick={() => galleryInputRefs.current[shot.category]?.click()}
                    >
                      Choose from gallery
                    </button>
                  </div>
                  <input
                    ref={(el) => {
                      cameraInputRefs.current[shot.category] = el;
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
                  <input
                    ref={(el) => {
                      galleryInputRefs.current[shot.category] = el;
                    }}
                    type="file"
                    accept="image/*"
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
        <Button
          type="button"
          className="w-full"
          disabled={pendingDamageCount === 0}
          onClick={() => router.push(`/incident/${incident.id}/damage`)}
        >
          {pendingDamageCount > 0 ? `Check damage with AI (${pendingDamageCount} waiting)` : "Check damage with AI"}
        </Button>
      </BottomActionBar>
    </div>
  );
}
