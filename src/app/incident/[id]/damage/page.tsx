"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { AiConsentSheet } from "@/components/ai-consent-sheet";
import { DamageOverlayCanvas } from "@/components/damage-overlay-canvas";
import { Button } from "@/components/ui/button";
import { colorForItemIndex } from "@/lib/damage-colors";
import { DAMAGE_PHOTO_CONCURRENCY, analyzeDamagePhoto } from "@/lib/damage-pipeline";
import { mapWithConcurrency } from "@/lib/concurrency";
import { getIncident, listPhotos, updateIncident, updatePhoto } from "@/lib/incidents";
import { DAMAGE_TYPES, SEVERITIES } from "@/lib/schemas/damage-analysis";
import type { DamageAnalysis, DamageItem, DamageType, Incident, Photo, Severity } from "@/lib/types";

const DAMAGE_CATEGORIES: Photo["category"][] = ["own_damage", "other_damage"];
const MAX_ATTEMPTS_BEFORE_SKIP = 2;

type Progress = "finding_damage" | "marking_area";

const PROGRESS_LABEL: Record<Progress, string> = {
  finding_damage: "Finding damage.",
  marking_area: "Marking the exact area.",
};

export default function DamageSectionPage() {
  const params = useParams<{ id: string }>();
  const [incident, setIncident] = useState<Incident | null | undefined>(undefined);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set());
  const [progressById, setProgressById] = useState<Record<string, Progress>>({});
  const [failedById, setFailedById] = useState<Record<string, string>>({});
  const [attemptsById, setAttemptsById] = useState<Record<string, number>>({});
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());
  const [showConsent, setShowConsent] = useState(false);
  const [editing, setEditing] = useState<{ photoId: string; itemId: string } | null>(null);

  useEffect(() => {
    getIncident(params.id).then((found) => setIncident(found ?? null));
    listPhotos(params.id).then(setPhotos);
  }, [params.id]);

  const damagePhotos = photos.filter((p) => DAMAGE_CATEGORIES.includes(p.category));
  const pendingPhotos = damagePhotos.filter(
    (p) => !p.analysis && !runningIds.has(p.id) && !failedById[p.id] && !skippedIds.has(p.id),
  );

  // SPEC F4 step 1: show the consent sheet once per incident, then run.
  useEffect(() => {
    if (!incident || damagePhotos.length === 0) return;
    if (pendingPhotos.length === 0) return;
    if (!incident.aiConsent) {
      setShowConsent(true);
      return;
    }
    void runPipelineFor(pendingPhotos);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per newly-discovered pending photo set, not on every render.
  }, [incident?.aiConsent, damagePhotos.length]);

  async function handleConsentContinue() {
    if (!incident) return;
    await updateIncident(incident.id, { aiConsent: true });
    setIncident({ ...incident, aiConsent: true });
    setShowConsent(false);
  }

  async function runPipelineFor(photosToRun: Photo[]) {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      const offline: Record<string, string> = {};
      for (const photo of photosToRun) offline[photo.id] = "Connect to the internet to use the AI check. Your photos are saved.";
      setFailedById((prev) => ({ ...prev, ...offline }));
      return;
    }
    setRunningIds((prev) => new Set([...prev, ...photosToRun.map((p) => p.id)]));
    setFailedById((prev) => {
      const next = { ...prev };
      for (const photo of photosToRun) delete next[photo.id];
      return next;
    });

    await mapWithConcurrency(photosToRun, DAMAGE_PHOTO_CONCURRENCY, async (photo) => {
      try {
        const analysis = await analyzeDamagePhoto(photo, {
          onProgress: (photoId, progress) => {
            if (progress === "finding_damage" || progress === "marking_area") {
              setProgressById((prev) => ({ ...prev, [photoId]: progress }));
            }
          },
        });
        await updatePhoto(photo.id, { analysis });
        setPhotos((prev) => prev.map((p) => (p.id === photo.id ? { ...p, analysis } : p)));
        setAttemptsById((prev) => ({ ...prev, [photo.id]: 0 }));
      } catch (error) {
        setFailedById((prev) => ({ ...prev, [photo.id]: error instanceof Error ? error.message : "The AI check failed." }));
        setAttemptsById((prev) => ({ ...prev, [photo.id]: (prev[photo.id] ?? 0) + 1 }));
      } finally {
        setRunningIds((prev) => {
          const next = new Set(prev);
          next.delete(photo.id);
          return next;
        });
        setProgressById((prev) => {
          const next = { ...prev };
          delete next[photo.id];
          return next;
        });
      }
    });
  }

  async function persistAnalysis(photoId: string, analysis: DamageAnalysis) {
    await updatePhoto(photoId, { analysis });
    setPhotos((prev) => prev.map((p) => (p.id === photoId ? { ...p, analysis } : p)));
  }

  function updateItem(photo: Photo, itemId: string, updater: (item: DamageItem) => DamageItem) {
    if (!photo.analysis) return;
    const items = photo.analysis.items.map((item) => (item.id === itemId ? updater(item) : item));
    void persistAnalysis(photo.id, { ...photo.analysis, items });
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
        <h1 className="mt-1 text-lg font-semibold">Damage review</h1>
      </header>

      <main className="flex-1 space-y-4 p-4 pb-10">
        {damagePhotos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No damage photos yet.{" "}
            <Link href={`/incident/${incident.id}/photos`} className="text-primary underline-offset-4 hover:underline">
              Add photos first.
            </Link>
          </p>
        ) : (
          <>
            <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
              AI marks are a guide. An assessor makes the final call.
            </p>
            {damagePhotos.map((photo) => (
              <DamagePhotoCard
                key={photo.id}
                photo={photo}
                running={runningIds.has(photo.id)}
                progress={progressById[photo.id]}
                failedMessage={failedById[photo.id]}
                attempts={attemptsById[photo.id] ?? 0}
                onRetry={() => runPipelineFor([photo])}
                onSkip={() => setSkippedIds((prev) => new Set([...prev, photo.id]))}
                editing={editing}
                onEditStart={(itemId) => setEditing({ photoId: photo.id, itemId })}
                onEditCancel={() => setEditing(null)}
                onEditSave={(itemId, changes) => {
                  updateItem(photo, itemId, (item) => ({ ...item, ...changes }));
                  setEditing(null);
                }}
                onConfirm={(itemId) => updateItem(photo, itemId, (item) => ({ ...item, status: "confirmed" }))}
                onDelete={(itemId) => updateItem(photo, itemId, (item) => ({ ...item, status: "deleted" }))}
              />
            ))}
          </>
        )}
      </main>

      {showConsent ? <AiConsentSheet onContinue={handleConsentContinue} onNotNow={() => setShowConsent(false)} /> : null}
    </div>
  );
}

interface DamagePhotoCardProps {
  photo: Photo;
  running: boolean;
  progress: Progress | undefined;
  failedMessage: string | undefined;
  attempts: number;
  onRetry: () => void;
  onSkip: () => void;
  editing: { photoId: string; itemId: string } | null;
  onEditStart: (itemId: string) => void;
  onEditCancel: () => void;
  onEditSave: (itemId: string, changes: Partial<DamageItem>) => void;
  onConfirm: (itemId: string) => void;
  onDelete: (itemId: string) => void;
}

function DamagePhotoCard({
  photo,
  running,
  progress,
  failedMessage,
  attempts,
  onRetry,
  onSkip,
  editing,
  onEditStart,
  onEditCancel,
  onEditSave,
  onConfirm,
  onDelete,
}: DamagePhotoCardProps) {
  if (running) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
        {progress ? PROGRESS_LABEL[progress] : "Starting."}
      </div>
    );
  }

  if (failedMessage) {
    return (
      <div className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
        <p className="text-sm">{failedMessage}</p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            Try again
          </Button>
          {attempts >= MAX_ATTEMPTS_BEFORE_SKIP ? (
            <Button type="button" variant="ghost" size="sm" onClick={onSkip}>
              Skip AI for this photo
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  const { analysis } = photo;
  if (!analysis) {
    return <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">Waiting.</div>;
  }

  if (!analysis.isVehiclePhoto) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 text-sm">
        This doesn&apos;t look like a car photo. Move it to another category?
      </div>
    );
  }

  const visibleItems = analysis.items.filter((item) => item.status !== "deleted");

  if (visibleItems.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 text-sm">No damage found in this photo.</div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-3">
      <DamageOverlayCanvas
        blobId={photo.blobId}
        width={photo.width}
        height={photo.height}
        vehicleMask={analysis.vehicleMask}
        overlayItems={visibleItems.map((item) => ({ item, colorIndex: analysis.items.indexOf(item) }))}
      />
      <ul className="space-y-2">
        {visibleItems.map((item) => {
          const index = analysis.items.indexOf(item);
          const isEditing = editing?.photoId === photo.id && editing.itemId === item.id;
          return (
            <li key={item.id} className="rounded-md border border-border p-2">
              {isEditing ? (
                <EditDamageItemForm item={item} onCancel={onEditCancel} onSave={(changes) => onEditSave(item.id, changes)} />
              ) : (
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block size-3 rounded-full"
                      style={{ backgroundColor: colorForItemIndex(index) }}
                      aria-hidden
                    />
                    <p className="font-medium">
                      {index + 1}. {item.part}, {item.damageType.replace("_", " ")}, {item.severity}
                    </p>
                    {item.status === "confirmed" ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                        Confirmed
                      </span>
                    ) : null}
                  </div>
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                  {!item.maskSvgPath ? <p className="text-xs text-muted-foreground">Mask not available.</p> : null}
                  {item.shareOfVehicle !== undefined ? (
                    <p className="text-xs text-muted-foreground">
                      Covers about {Math.round(item.shareOfVehicle * 100)}% of the visible car.
                    </p>
                  ) : null}
                  <div className="flex gap-2 pt-1">
                    <Button type="button" size="sm" variant="outline" onClick={() => onConfirm(item.id)}>
                      Confirm
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => onEditStart(item.id)}>
                      Edit
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => onDelete(item.id)}>
                      Delete
                    </Button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {analysis.qualityNote ? <p className="text-xs text-muted-foreground">{analysis.qualityNote}</p> : null}
    </div>
  );
}

function EditDamageItemForm({
  item,
  onCancel,
  onSave,
}: {
  item: DamageItem;
  onCancel: () => void;
  onSave: (changes: Partial<DamageItem>) => void;
}) {
  const [part, setPart] = useState(item.part);
  const [damageType, setDamageType] = useState<DamageType>(item.damageType);
  const [severity, setSeverity] = useState<Severity>(item.severity);
  const [description, setDescription] = useState(item.description);

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-muted-foreground">
        Part
        <input
          className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
          value={part}
          onChange={(e) => setPart(e.target.value)}
        />
      </label>
      <label className="block text-xs font-medium text-muted-foreground">
        Damage type
        <select
          className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
          value={damageType}
          onChange={(e) => setDamageType(e.target.value as DamageType)}
        >
          {DAMAGE_TYPES.map((type) => (
            <option key={type} value={type}>
              {type.replace("_", " ")}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs font-medium text-muted-foreground">
        Severity
        <select
          className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
          value={severity}
          onChange={(e) => setSeverity(e.target.value as Severity)}
        >
          {SEVERITIES.map((level) => (
            <option key={level} value={level}>
              {level}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs font-medium text-muted-foreground">
        Description
        <textarea
          className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <div className="flex gap-2 pt-1">
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" size="sm" onClick={() => onSave({ part, damageType, severity, description })}>
          Save
        </Button>
      </div>
    </div>
  );
}
