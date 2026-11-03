"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { BottomActionBar } from "@/components/bottom-action-bar";
import type { ClaimPackPdfImages } from "@/components/pack-pdf-document";
import { Button } from "@/components/ui/button";
import { formatLocalDate, toLocalInputValue } from "@/lib/datetime";
import {
  PDF_LARGE_PACK_MAX_DIMENSION,
  PDF_PHOTO_COUNT_THRESHOLD,
  flattenDamagePhoto,
  flattenPhoto,
  type FlattenedDamagePhoto,
  type FlattenedPhoto,
} from "@/lib/flatten-photo";
import { getIncident, listPhotos, updateIncident } from "@/lib/incidents";
import { buildClaimPackData } from "@/lib/pack-data";
import { buildPackFileName } from "@/lib/pack-filename";
import { canGeneratePack, getChecklistItems, getRequiredItems } from "@/lib/pack-readiness";
import type { Incident, Photo } from "@/lib/types";

const PDF_MAX_BYTES = 15 * 1024 * 1024; // SPEC A9: "File size under 15 MB for 12 photos."

// Navigator.share/canShare (Web Share API Level 2, files) are not yet in
// every TS DOM lib version; narrow what we need instead of widening the
// whole Navigator type.
interface ShareCapableNavigator {
  share?: (data: { files?: File[]; title?: string; text?: string }) => Promise<void>;
  canShare?: (data: { files?: File[] }) => boolean;
}

export default function PackSectionPage() {
  const params = useParams<{ id: string }>();
  const [incident, setIncident] = useState<Incident | null | undefined>(undefined);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [registrationDraft, setRegistrationDraft] = useState("");
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [largeFileWarning, setLargeFileWarning] = useState(false);
  const incidentRef = useRef(incident);

  useEffect(() => {
    incidentRef.current = incident;
  }, [incident]);

  useEffect(() => {
    getIncident(params.id)
      .then((found) => {
        setIncident(found ?? null);
        if (found) setRegistrationDraft(found.ownVehicle.registration);
      })
      .catch(() => setIncident(null));
    listPhotos(params.id)
      .then(setPhotos)
      .catch(() => setPhotos([]));
  }, [params.id]);

  // Same object-URL-with-cleanup pattern as PhotoThumb/DamageOverlayCanvas:
  // the URL is an external-resource handle tied to pdfBlob's lifetime, not
  // state derived by computation, so it belongs in an effect even though
  // that means a setState call here.
  useEffect(() => {
    if (!pdfBlob) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPdfUrl(null);
      return;
    }
    const url = URL.createObjectURL(pdfBlob);
    setPdfUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pdfBlob]);

  async function handleSaveRegistration() {
    if (!incident) return;
    const registration = registrationDraft.trim();
    await updateIncident(incident.id, { ownVehicle: { ...incident.ownVehicle, registration } });
    setIncident((prev) => (prev ? { ...prev, ownVehicle: { ...prev.ownVehicle, registration } } : prev));
  }

  async function handleGenerate() {
    const current = incidentRef.current;
    if (!current || building) return;
    setBuilding(true);
    setBuildError(null);
    setLargeFileWarning(false);
    try {
      const generatedAt = new Date().toISOString();
      const data = buildClaimPackData(current, photos, generatedAt);
      const totalPhotos = data.damagePhotos.length + data.otherPhotos.length;
      const maxDimension = totalPhotos > PDF_PHOTO_COUNT_THRESHOLD ? PDF_LARGE_PACK_MAX_DIMENSION : Infinity;

      const damagePhotos: Record<string, FlattenedDamagePhoto> = {};
      for (const photo of data.damagePhotos) {
        damagePhotos[photo.photoId] = await flattenDamagePhoto(
          photo.blobId,
          photo.width,
          photo.height,
          maxDimension,
          photo.vehicleMask,
          photo.items,
        );
      }
      const otherPhotos: Record<string, FlattenedPhoto> = {};
      for (const photo of data.otherPhotos) {
        otherPhotos[photo.photoId] = await flattenPhoto(photo.blobId, photo.width, photo.height, maxDimension);
      }
      const images: ClaimPackPdfImages = { damagePhotos, otherPhotos };

      const [{ pdf }, { ClaimPackPdfDocument }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/components/pack-pdf-document"),
      ]);
      const instance = pdf(<ClaimPackPdfDocument data={data} images={images} />);
      const blob = await instance.toBlob();

      setPdfBlob(blob);
      setLargeFileWarning(blob.size > PDF_MAX_BYTES);
      await updateIncident(current.id, { status: "exported" });
      setIncident((prev) => (prev ? { ...prev, status: "exported" } : prev));
    } catch (error) {
      setBuildError(error instanceof Error ? error.message : "Could not build the PDF on this browser.");
    } finally {
      setBuilding(false);
    }
  }

  async function handleShare() {
    if (!pdfBlob || !incident) return;
    const nav = navigator as unknown as ShareCapableNavigator;
    const file = new File([pdfBlob], buildPackFileName(incident), { type: "application/pdf" });
    if (!nav.canShare?.({ files: [file] }) || !nav.share) return;
    try {
      await nav.share({ files: [file], title: "Motor accident claim pack", text: `Claim pack for ${incident.reference}` });
    } catch {
      // User cancelled the share sheet. Nothing to do.
    }
  }

  function handleDownload() {
    if (!pdfBlob || !incident) return;
    const url = URL.createObjectURL(pdfBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = buildPackFileName(incident);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function handleEmail() {
    if (!incident) return;
    const dateLabel = formatLocalDate(toLocalInputValue(incident.occurredAt));
    const reg = incident.ownVehicle.registration || "your vehicle";
    const subject = `Motor claim: ${reg}, accident on ${dateLabel}`;
    const body = "Please find my claim pack attached. Download the PDF from Ajali Kit first and attach it here before sending.";
    const to = incident.ownVehicle.insurerClaimsEmail ?? "";
    window.location.href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  if (incident === undefined) {
    return <p className="p-4 text-sm text-muted-foreground">Loading.</p>;
  }
  if (incident === null) {
    return <p className="p-4 text-sm text-muted-foreground">Incident not found.</p>;
  }

  const requiredItems = getRequiredItems(incident, photos);
  const checklistItems = getChecklistItems(incident);
  const canGenerate = canGeneratePack(incident, photos);
  const canShareFiles =
    typeof navigator !== "undefined" &&
    Boolean(
      (navigator as unknown as ShareCapableNavigator).share &&
        (navigator as unknown as ShareCapableNavigator).canShare?.({ files: [new File([], "x.pdf", { type: "application/pdf" })] }),
    );

  return (
    <div className="flex flex-1 flex-col pb-28">
      <header className="bg-navy px-4 py-6 text-white">
        <Link href={`/incident/${incident.id}`} className="text-sm text-white/70 underline-offset-4 hover:underline">
          ‹ Back to incident
        </Link>
        <h1 className="mt-1 text-lg font-semibold">Claim pack</h1>
      </header>

      <main className="flex-1 space-y-5 p-4">
        <section className="space-y-2">
          <p className="text-sm font-medium">Required for your claim pack</p>
          <ul className="space-y-2 rounded-lg border border-border bg-card p-3">
            {requiredItems.map((item) => (
              <li key={item.key} className="flex items-center justify-between gap-3 text-sm">
                <span>
                  {item.met ? "✓" : "○"} {item.label}
                </span>
                {!item.met && item.key === "registration" ? (
                  <div className="flex items-center gap-1">
                    <input
                      className="h-8 w-24 rounded-md border border-input bg-background px-2 text-xs"
                      placeholder="KDA 123A"
                      value={registrationDraft}
                      onChange={(e) => setRegistrationDraft(e.target.value)}
                    />
                    <Button type="button" size="xs" variant="outline" onClick={handleSaveRegistration}>
                      Save
                    </Button>
                  </div>
                ) : !item.met && item.fixHref ? (
                  <Link href={`/incident/${incident.id}/${item.fixHref}`} className="text-xs font-medium text-primary underline-offset-4 hover:underline">
                    Add
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </section>

        {checklistItems.length > 0 ? (
          <section className="space-y-2">
            <p className="text-sm font-medium">Good to have</p>
            <ul className="space-y-2 rounded-lg border border-border bg-card p-3">
              {checklistItems.map((item) => (
                <li key={item.key} className="flex items-center justify-between gap-3 text-sm">
                  <span>
                    {item.met ? "✓" : "○"} {item.label}
                  </span>
                  {!item.met && item.fixHref ? (
                    <Link href={`/incident/${incident.id}/${item.fixHref}`} className="text-xs font-medium text-primary underline-offset-4 hover:underline">
                      Add
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {!pdfBlob ? (
          <Button type="button" className="w-full" disabled={!canGenerate || building} onClick={handleGenerate}>
            {building ? "Building your pack." : "Build claim pack"}
          </Button>
        ) : null}

        {buildError ? (
          <div className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <p>{buildError}</p>
            <Link href={`/incident/${incident.id}/pack/print`} className="font-medium text-primary underline-offset-4 hover:underline">
              Open the printable version instead
            </Link>
          </div>
        ) : null}

        {pdfBlob && pdfUrl ? (
          <section className="space-y-3">
            <p className="text-sm font-medium">Your claim pack</p>
            {largeFileWarning ? (
              <p className="rounded-lg bg-amber/15 p-3 text-sm">This pack is over 15 MB. Sharing may be slow on a weak connection.</p>
            ) : null}
            <iframe title="Claim pack preview" src={pdfUrl} className="h-96 w-full rounded-lg border border-border" />
            <div className="flex flex-col gap-2">
              {canShareFiles ? (
                <Button type="button" onClick={handleShare}>
                  Share PDF
                </Button>
              ) : null}
              <Button type="button" variant="outline" onClick={handleDownload}>
                Download PDF
              </Button>
              <Button type="button" variant="outline" onClick={handleEmail}>
                Email the insurer
              </Button>
              <Link href={`/incident/${incident.id}/pack/print`} className="text-center text-sm text-primary underline-offset-4 hover:underline">
                Open printable version
              </Link>
            </div>
            <div className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">What next</p>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                <li>Keep your OB number safe.</li>
                <li>Collect the police abstract when it is ready.</li>
                <li>Don&apos;t repair the car before your insurer&apos;s assessor approves it.</li>
                <li>Keep your receipts.</li>
              </ul>
            </div>
          </section>
        ) : null}

        {!pdfBlob && !canGenerate ? (
          <p className="text-xs text-muted-foreground">Add the required items above to build your claim pack.</p>
        ) : null}
      </main>

      <BottomActionBar>
        <Link href={`/incident/${incident.id}`} className="w-full">
          <Button type="button" variant="outline" className="w-full">
            Back to incident
          </Button>
        </Link>
      </BottomActionBar>
    </div>
  );
}
