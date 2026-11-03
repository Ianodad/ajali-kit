"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { AiConsentSheet } from "@/components/ai-consent-sheet";
import { Button } from "@/components/ui/button";
import { blobToDataUrl } from "@/lib/blob-data-url";
import { extractDocument } from "@/lib/extract-document-client";
import {
  applyExtractedFields,
  confirmOtherParty,
  isBlurryResult,
  isScannableDocType,
  manualExtractedField,
  type ExtractDocumentData,
} from "@/lib/extract-document-mapping";
import { processImage } from "@/lib/image";
import { getIncident, savePhoto, updateIncident } from "@/lib/incidents";
import type { DocType, ExtractedField, Incident, OtherParty } from "@/lib/types";
import { useFlushOnUnmount } from "@/lib/use-flush-on-unmount";
import { cn } from "@/lib/utils";

const AUTOSAVE_DELAY_MS = 600;

const DOC_SCAN_OPTIONS: { docType: DocType; label: string }[] = [
  { docType: "driving_licence", label: "Driving licence" },
  { docType: "logbook", label: "Logbook" },
  { docType: "insurance_certificate", label: "Insurance certificate" },
];

const DOC_TYPE_LABEL: Record<DocType, string> = {
  driving_licence: "driving licence",
  logbook: "logbook",
  insurance_certificate: "insurance certificate",
  police_abstract: "police abstract",
  national_id: "national ID",
  other: "document",
};

function blankParty(): OtherParty {
  return { id: crypto.randomUUID(), driver: {}, vehicle: {}, refusedToShare: false, confirmed: false };
}

interface PendingScan {
  partyId: string;
  docType: DocType;
  blob: Blob;
}

interface MismatchState {
  partyId: string;
  requestedDocType: DocType;
  detectedDocType: DocType;
  fields: ExtractDocumentData["fields"];
  // Whether applyExtractedFields knows how to map `detectedDocType` onto an
  // OtherParty. False for national_id, police_abstract and other: there is
  // nothing to "use it as", only a retake-or-type-it-yourself message.
  supported: boolean;
}

interface BlurryState {
  partyId: string;
  docType: DocType;
}

export default function OtherPartySectionPage() {
  const params = useParams<{ id: string }>();
  const [incident, setIncident] = useState<Incident | null | undefined>(undefined);
  const [scanningKey, setScanningKey] = useState<string | null>(null);
  const [scanErrors, setScanErrors] = useState<Record<string, string>>({});
  const [pendingScan, setPendingScan] = useState<PendingScan | null>(null);
  const [showConsent, setShowConsent] = useState(false);
  const [mismatch, setMismatch] = useState<MismatchState | null>(null);
  const [blurryNotice, setBlurryNotice] = useState<BlurryState | null>(null);
  // The last successfully captured blob per scan key, so a failed extraction
  // can retry against the photo already saved, instead of asking the user
  // to recapture it (P4.R finding 5).
  const [lastBlobByKey, setLastBlobByKey] = useState<Record<string, Blob>>({});

  useEffect(() => {
    getIncident(params.id)
      .then((found) => setIncident(found ?? null))
      .catch(() => setIncident(null));
  }, [params.id]);

  // Autosave, same pattern as the Incident basics page: everything typed or
  // toggled here persists on its own after a short pause, no explicit Save.
  useEffect(() => {
    if (!incident) return;
    const timeout = setTimeout(() => {
      updateIncident(incident.id, {
        otherPartyInvolved: incident.otherPartyInvolved,
        otherParties: incident.otherParties,
      });
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [incident]);

  // Flushes whatever is in local state the moment this page unmounts (for
  // example, navigating Back within the autosave's 600ms window), so those
  // edits are not silently lost (P4.R finding 1).
  useFlushOnUnmount(incident, (current) => {
    if (!current) return;
    void updateIncident(current.id, {
      otherPartyInvolved: current.otherPartyInvolved,
      otherParties: current.otherParties,
    });
  });

  function updateParty(partyId: string, updater: (party: OtherParty) => OtherParty) {
    setIncident((prev) => (prev ? { ...prev, otherParties: prev.otherParties.map((p) => (p.id === partyId ? updater(p) : p)) } : prev));
  }

  function handleInvolvedChange(value: Incident["otherPartyInvolved"]) {
    setIncident((prev) => {
      if (!prev) return prev;
      const otherParties = value === "no" || prev.otherParties.length > 0 ? prev.otherParties : [blankParty()];
      return { ...prev, otherPartyInvolved: value, otherParties };
    });
  }

  function handleAddParty() {
    setIncident((prev) => (prev ? { ...prev, otherParties: [...prev.otherParties, blankParty()] } : prev));
  }

  function handleRemoveParty(partyId: string) {
    setIncident((prev) => (prev ? { ...prev, otherParties: prev.otherParties.filter((p) => p.id !== partyId) } : prev));
  }

  async function runExtraction(partyId: string, docType: DocType, blob: Blob) {
    const key = `${partyId}:${docType}`;
    setScanningKey(key);
    setScanErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    try {
      const dataUrl = await blobToDataUrl(blob);
      const result = await extractDocument(dataUrl, docType);
      if (isBlurryResult(result.fields)) {
        setBlurryNotice({ partyId, docType });
        return;
      }
      if (result.detectedDocType !== docType) {
        setMismatch({
          partyId,
          requestedDocType: docType,
          detectedDocType: result.detectedDocType,
          fields: result.fields,
          supported: isScannableDocType(result.detectedDocType),
        });
        return;
      }
      updateParty(partyId, (party) => applyExtractedFields(party, docType, result.fields));
    } catch (error) {
      setScanErrors((prev) => ({ ...prev, [key]: error instanceof Error ? error.message : "We couldn't read this document. Try again." }));
    } finally {
      setScanningKey(null);
    }
  }

  function handleRetryScan(partyId: string, docType: DocType) {
    const blob = lastBlobByKey[`${partyId}:${docType}`];
    if (!blob) return;
    void runExtraction(partyId, docType, blob);
  }

  // "Skip, I'll fill it in": the fields stay editable by hand either way, so
  // skipping just clears the error banner rather than needing its own state.
  function handleSkipScanError(partyId: string, docType: DocType) {
    const key = `${partyId}:${docType}`;
    setScanErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  async function handleDocFileSelected(partyId: string, docType: DocType, file: File | undefined) {
    if (!file || !incident) return;
    const key = `${partyId}:${docType}`;
    setScanErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    try {
      const processed = await processImage(file);
      await savePhoto({
        incidentId: incident.id,
        category: "document",
        docType,
        otherPartyId: partyId,
        blob: processed.blob,
        thumbBlob: processed.thumbBlob,
        width: processed.width,
        height: processed.height,
        lat: incident.location.lat,
        lng: incident.location.lng,
      });
      setLastBlobByKey((prev) => ({ ...prev, [key]: processed.blob }));
      if (!incident.aiConsent) {
        setPendingScan({ partyId, docType, blob: processed.blob });
        setShowConsent(true);
        return;
      }
      await runExtraction(partyId, docType, processed.blob);
    } catch {
      setScanErrors((prev) => ({ ...prev, [key]: "Could not save that photo. Your phone may be out of space." }));
    }
  }

  async function handleConsentContinue() {
    if (!incident) return;
    await updateIncident(incident.id, { aiConsent: true });
    setIncident({ ...incident, aiConsent: true });
    setShowConsent(false);
    if (pendingScan) {
      await runExtraction(pendingScan.partyId, pendingScan.docType, pendingScan.blob);
      setPendingScan(null);
    }
  }

  function handleConsentDecline() {
    setShowConsent(false);
    setPendingScan(null);
  }

  function handleMismatchUseDetected() {
    if (!mismatch) return;
    updateParty(mismatch.partyId, (party) => applyExtractedFields(party, mismatch.detectedDocType, mismatch.fields));
    setMismatch(null);
  }

  if (incident === undefined) {
    return <p className="p-4 text-sm text-muted-foreground">Loading.</p>;
  }
  if (incident === null) {
    return <p className="p-4 text-sm text-muted-foreground">Incident not found.</p>;
  }

  const showForm = incident.otherPartyInvolved === "yes" || incident.otherPartyInvolved === "unsure";

  return (
    <div className="flex flex-1 flex-col">
      <header className="bg-navy px-4 py-6 text-white">
        <Link href={`/incident/${incident.id}`} className="text-sm text-white/70 underline-offset-4 hover:underline">
          ‹ Back to incident
        </Link>
        <h1 className="mt-1 text-lg font-semibold">Other party</h1>
      </header>

      <main className="flex-1 space-y-4 p-4 pb-10">
        <div className="space-y-2">
          <p className="text-sm font-medium">Was another vehicle involved?</p>
          <div className="flex gap-2">
            {(
              [
                { value: "yes" as const, label: "Yes" },
                { value: "no" as const, label: "No" },
                { value: "unsure" as const, label: "Not sure" },
              ]
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleInvolvedChange(option.value)}
                className={cn(
                  "min-h-10 flex-1 rounded-lg border px-3 py-2 text-sm",
                  incident.otherPartyInvolved === option.value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {incident.otherPartyInvolved === "no" ? (
          <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">No other vehicle was involved. This section is done.</p>
        ) : null}

        {showForm
          ? incident.otherParties.map((party, index) => (
              <OtherPartyCard
                key={party.id}
                party={party}
                index={index}
                canRemove={incident.otherParties.length > 1}
                scanningKey={scanningKey}
                scanErrors={scanErrors}
                blurryNotice={blurryNotice?.partyId === party.id ? blurryNotice : null}
                onDismissBlurry={() => setBlurryNotice(null)}
                onChange={(updater) => updateParty(party.id, updater)}
                onRemove={() => handleRemoveParty(party.id)}
                onScan={(docType, file) => handleDocFileSelected(party.id, docType, file)}
                onRetry={(docType) => handleRetryScan(party.id, docType)}
                onSkipError={(docType) => handleSkipScanError(party.id, docType)}
                canRetry={(docType) => Boolean(lastBlobByKey[`${party.id}:${docType}`])}
              />
            ))
          : null}

        {showForm ? (
          <Button type="button" variant="outline" onClick={handleAddParty}>
            Add another vehicle
          </Button>
        ) : null}
      </main>

      {showConsent ? (
        <AiConsentSheet
          message="We will send this document's photo to Meta's AI to read its details. They are not used to train Meta's models. Continue?"
          onContinue={handleConsentContinue}
          onNotNow={handleConsentDecline}
        />
      ) : null}

      {mismatch ? (
        <div className="fixed inset-0 z-30 flex items-end bg-black/50" role="dialog" aria-modal>
          <div className="w-full rounded-t-2xl bg-background p-5 pb-8">
            {mismatch.supported ? (
              <>
                <p className="text-sm">
                  This looks like a {DOC_TYPE_LABEL[mismatch.detectedDocType]}. Use it as a {DOC_TYPE_LABEL[mismatch.detectedDocType]}?
                </p>
                <div className="mt-4 flex gap-3">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setMismatch(null)}>
                    No, try again
                  </Button>
                  <Button type="button" className="flex-1" onClick={handleMismatchUseDetected}>
                    Yes, use it
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm">
                  This does not look like a {DOC_TYPE_LABEL[mismatch.requestedDocType]}. Retake it in good light, or fill in the details
                  yourself.
                </p>
                <div className="mt-4 flex gap-3">
                  <Button type="button" className="flex-1" onClick={() => setMismatch(null)}>
                    OK
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

interface OtherPartyCardProps {
  party: OtherParty;
  index: number;
  canRemove: boolean;
  scanningKey: string | null;
  scanErrors: Record<string, string>;
  blurryNotice: BlurryState | null;
  onDismissBlurry: () => void;
  onChange: (updater: (party: OtherParty) => OtherParty) => void;
  onRemove: () => void;
  onScan: (docType: DocType, file: File | undefined) => void;
  onRetry: (docType: DocType) => void;
  onSkipError: (docType: DocType) => void;
  canRetry: (docType: DocType) => boolean;
}

function OtherPartyCard({
  party,
  index,
  canRemove,
  scanningKey,
  scanErrors,
  blurryNotice,
  onDismissBlurry,
  onChange,
  onRemove,
  onScan,
  onRetry,
  onSkipError,
  canRetry,
}: OtherPartyCardProps) {
  // Owned here, not passed in from the parent: a ref map mutated by a
  // component other than the one that created it is unsafe under the React
  // Compiler's immutability checks. Keyed by docType only, since each card
  // instance already scopes these to one party.
  const cameraInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const galleryInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  return (
    <details className="rounded-lg border border-border bg-card p-3" open>
      <summary className="cursor-pointer font-medium">
        Vehicle {index + 1}
        {party.confirmed ? (
          <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">Confirmed</span>
        ) : null}
      </summary>

      <div className="mt-3 space-y-4">
        <section className="space-y-2">
          <p className="text-sm font-medium">Scan a document</p>
          <div className="flex flex-wrap gap-2">
            {DOC_SCAN_OPTIONS.map((option) => {
              const scanKey = `${party.id}:${option.docType}`;
              return (
                <div key={option.docType} className="flex flex-col items-stretch gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={scanningKey === scanKey}
                    onClick={() => cameraInputRefs.current[option.docType]?.click()}
                  >
                    {scanningKey === scanKey ? "Reading." : `Scan ${option.label.toLowerCase()}`}
                  </Button>
                  <button
                    type="button"
                    className="text-xs text-primary underline-offset-4 hover:underline"
                    onClick={() => galleryInputRefs.current[option.docType]?.click()}
                  >
                    Choose from gallery
                  </button>
                  <input
                    ref={(el) => {
                      cameraInputRefs.current[option.docType] = el;
                    }}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => {
                      onScan(option.docType, e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                  <input
                    ref={(el) => {
                      galleryInputRefs.current[option.docType] = el;
                    }}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      onScan(option.docType, e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                  {scanErrors[scanKey] ? (
                    <div className="max-w-32 space-y-1">
                      <p className="text-xs text-destructive">{scanErrors[scanKey]}</p>
                      <div className="flex flex-wrap gap-2">
                        {canRetry(option.docType) ? (
                          <button
                            type="button"
                            className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                            onClick={() => onRetry(option.docType)}
                          >
                            Try again
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                          onClick={() => onSkipError(option.docType)}
                        >
                          Skip, I&apos;ll fill it in
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
          {blurryNotice ? (
            <div className="flex items-center justify-between gap-3 rounded-lg bg-amber/15 p-3 text-sm">
              <p>We couldn&apos;t read this clearly. Retake in good light, flat, without glare.</p>
              <Button type="button" variant="ghost" size="sm" onClick={onDismissBlurry}>
                OK
              </Button>
            </div>
          ) : null}
        </section>

        <section className="space-y-2">
          <p className="text-sm font-medium">Driver</p>
          <ExtractedFieldRow
            label="Full name"
            field={party.driver.name}
            onChange={(value) => onChange((p) => ({ ...p, driver: { ...p.driver, name: manualExtractedField(value) } }))}
          />
          <PlainFieldRow
            label="Phone"
            value={party.driver.phone}
            onChange={(value) => onChange((p) => ({ ...p, driver: { ...p.driver, phone: value } }))}
          />
          <ExtractedFieldRow
            label="ID number (optional)"
            field={party.driver.idNumber}
            onChange={(value) => onChange((p) => ({ ...p, driver: { ...p.driver, idNumber: manualExtractedField(value) } }))}
          />
          <ExtractedFieldRow
            label="Licence number"
            field={party.driver.licenceNumber}
            onChange={(value) => onChange((p) => ({ ...p, driver: { ...p.driver, licenceNumber: manualExtractedField(value) } }))}
          />
          <ExtractedFieldRow
            label="Licence expiry"
            field={party.driver.licenceExpiry}
            onChange={(value) => onChange((p) => ({ ...p, driver: { ...p.driver, licenceExpiry: manualExtractedField(value) } }))}
          />
        </section>

        <section className="space-y-2">
          <p className="text-sm font-medium">Vehicle</p>
          <ExtractedFieldRow
            label="Registration"
            field={party.vehicle.registration}
            onChange={(value) => onChange((p) => ({ ...p, vehicle: { ...p.vehicle, registration: manualExtractedField(value) } }))}
          />
          <ExtractedFieldRow
            label="Make"
            field={party.vehicle.make}
            onChange={(value) => onChange((p) => ({ ...p, vehicle: { ...p.vehicle, make: manualExtractedField(value) } }))}
          />
          <ExtractedFieldRow
            label="Model"
            field={party.vehicle.model}
            onChange={(value) => onChange((p) => ({ ...p, vehicle: { ...p.vehicle, model: manualExtractedField(value) } }))}
          />
          <PlainFieldRow
            label="Colour"
            value={party.vehicle.colour}
            onChange={(value) => onChange((p) => ({ ...p, vehicle: { ...p.vehicle, colour: value } }))}
          />
        </section>

        <section className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={party.owner !== undefined}
              onChange={(e) => onChange((p) => ({ ...p, owner: e.target.checked ? (p.owner ?? {}) : undefined }))}
            />
            Owner is different from the driver
          </label>
          {party.owner !== undefined ? (
            <div className="space-y-2 pl-1">
              <ExtractedFieldRow
                label="Owner full name"
                field={party.owner.name}
                onChange={(value) => onChange((p) => ({ ...p, owner: { ...p.owner, name: manualExtractedField(value) } }))}
              />
              <PlainFieldRow
                label="Owner phone"
                value={party.owner.phone}
                onChange={(value) => onChange((p) => ({ ...p, owner: { ...p.owner, phone: value } }))}
              />
            </div>
          ) : null}
        </section>

        <section className="space-y-2">
          <p className="text-sm font-medium">Insurance</p>
          <ExtractedFieldRow
            label="Insurer"
            field={party.insurance?.insurer}
            onChange={(value) => onChange((p) => ({ ...p, insurance: { ...p.insurance, insurer: manualExtractedField(value) } }))}
          />
          <ExtractedFieldRow
            label="Policy or certificate number"
            field={party.insurance?.policyOrCertificateNo}
            onChange={(value) => onChange((p) => ({ ...p, insurance: { ...p.insurance, policyOrCertificateNo: manualExtractedField(value) } }))}
          />
          <ExtractedFieldRow
            label="Certificate expiry"
            field={party.insurance?.expiry}
            onChange={(value) => onChange((p) => ({ ...p, insurance: { ...p.insurance, expiry: manualExtractedField(value) } }))}
          />
        </section>

        <section className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={party.refusedToShare}
              onChange={(e) => onChange((p) => ({ ...p, refusedToShare: e.target.checked }))}
            />
            Driver refused to share details
          </label>
          {party.refusedToShare ? (
            <p className="text-xs text-muted-foreground">Take a photo of the plate and report this to the police.</p>
          ) : null}
        </section>

        <section className="space-y-1">
          <label className="block text-xs font-medium text-muted-foreground">
            Did they admit anything? Write only what was said.
            <textarea
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              rows={2}
              value={party.notes ?? ""}
              onChange={(e) => onChange((p) => ({ ...p, notes: e.target.value }))}
            />
          </label>
        </section>

        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={party.confirmed}
            onChange={(e) => onChange((p) => (e.target.checked ? confirmOtherParty(p) : { ...p, confirmed: false }))}
          />
          These details are correct
        </label>

        {canRemove ? (
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            Remove this vehicle
          </Button>
        ) : null}
      </div>
    </details>
  );
}

function ExtractedFieldRow({
  label,
  field,
  onChange,
}: {
  label: string;
  field?: ExtractedField;
  onChange: (value: string) => void;
}) {
  const lowConfidence = field?.confidence === "low" && !field.userConfirmed;
  return (
    <label className="block text-xs font-medium text-muted-foreground">
      {label}
      <input
        className={cn(
          "mt-1 h-10 w-full rounded-lg border bg-background px-3 text-sm text-foreground",
          lowConfidence ? "border-amber-500 bg-amber-50" : "border-input",
        )}
        value={field?.value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      />
      {lowConfidence ? <span className="mt-1 block text-xs font-medium text-amber-700">Check this</span> : null}
    </label>
  );
}

function PlainFieldRow({ label, value, onChange }: { label: string; value?: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-xs font-medium text-muted-foreground">
      {label}
      <input
        className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
