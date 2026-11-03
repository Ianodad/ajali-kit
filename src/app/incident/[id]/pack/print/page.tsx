"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { DamageOverlayCanvas } from "@/components/damage-overlay-canvas";
import { PhotoImage } from "@/components/photo-image";
import { Button } from "@/components/ui/button";
import { formatLocalDateTime, toLocalInputValue } from "@/lib/datetime";
import { getIncident, listPhotos } from "@/lib/incidents";
import { buildClaimPackData } from "@/lib/pack-data";
import { canGeneratePack } from "@/lib/pack-readiness";
import type { Incident, Photo } from "@/lib/types";

// S18b: "PDF generation fails on an old browser: fall back to a printable
// HTML page and 'Use your browser's Print to save as PDF.'" Same data
// assembly as the PDF (buildClaimPackData), rendered as plain HTML with
// print CSS, so the two never show different facts even if their layout
// differs.
export default function PackPrintPage() {
  const params = useParams<{ id: string }>();
  const [incident, setIncident] = useState<Incident | null | undefined>(undefined);
  const [photos, setPhotos] = useState<Photo[]>([]);

  useEffect(() => {
    getIncident(params.id).then((found) => setIncident(found ?? null));
    listPhotos(params.id).then(setPhotos);
  }, [params.id]);

  const data = useMemo(
    () => (incident ? buildClaimPackData(incident, photos, new Date().toISOString()) : null),
    [incident, photos],
  );

  // Check for a missing incident before the generic "still loading" guard:
  // once getIncident resolves to null, data stays null too (buildClaimPackData
  // never ran), so testing `!data` first always hid the real "not found"
  // state behind "Loading." forever (Codex review finding 5).
  if (incident === null) {
    return <p className="p-4 text-sm text-muted-foreground">Incident not found.</p>;
  }
  if (incident === undefined || !data) {
    return <p className="p-4 text-sm text-muted-foreground">Loading.</p>;
  }

  // This page is a straight export fallback for S18's Generate, so it must
  // not let an incomplete incident (and, in particular, an unconfirmed
  // account under a printed declaration) out the door just because someone
  // navigated here directly (Codex review finding 3).
  if (!canGeneratePack(incident, photos)) {
    return (
      <div className="p-4 text-sm">
        <p className="text-muted-foreground">
          This claim pack is not ready yet. Add the required items first.
        </p>
        <Link href={`/incident/${incident.id}/pack`} className="font-medium text-primary underline-offset-4 hover:underline">
          Back to claim pack
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-4 text-sm text-foreground print:max-w-none print:p-0 print:text-black">
      <div className="mb-4 flex items-center justify-between gap-2 print:hidden">
        <Link href={`/incident/${incident.id}/pack`} className="text-sm text-primary underline-offset-4 hover:underline">
          ‹ Back to claim pack
        </Link>
        <Button type="button" onClick={() => window.print()}>
          Use your browser&apos;s Print to save as PDF
        </Button>
      </div>

      <h1 className="text-xl font-bold">Motor Accident Claim Pack</h1>
      <p className="text-muted-foreground print:text-black">{data.reference}</p>

      <Section title="Summary">
        <Field label="Incident date" value={formatLocalDateTime(data.occurredAtLocal)} />
        <Field label="Place" value={data.locationText || "Not recorded"} />
        <Field label="Own vehicle registration" value={data.ownRegistration || "Not recorded"} />
        {data.claimantName ? <Field label="Claimant" value={data.claimantName} /> : null}
        <Field label="Generated" value={formatLocalDateTime(toLocalInputValue(data.generatedAt))} />
        <Field label="Anyone injured" value={data.anyoneInjured === null ? "Not answered" : data.anyoneInjured ? "Yes" : "No"} />
        <Field label="Police OB number" value={data.police.obNumber || "Not yet on file"} />
        <Field label="Outstanding items" value={data.outstandingLabels.length ? data.outstandingLabels.join(", ") : "None"} />
      </Section>

      <Section title="Incident details">
        <Field label="Weather" value={data.weather ?? "Not recorded"} />
        <Field label="Road" value={data.road.length ? data.road.join(", ") : "Not recorded"} />
        {data.locationCoords ? (
          <Field label="Coordinates" value={`${data.locationCoords.lat.toFixed(5)}, ${data.locationCoords.lng.toFixed(5)}`} />
        ) : null}
      </Section>

      <Section title="Claimant's account">
        <p className="whitespace-pre-wrap">{data.accountText || "Not provided."}</p>
        <p className="mt-2 text-xs text-muted-foreground print:text-black">
          Declaration: I confirm this account is true to the best of my knowledge.
          {data.accountConfirmedAt ? ` Confirmed ${formatLocalDateTime(toLocalInputValue(data.accountConfirmedAt))}.` : ""}
        </p>
      </Section>

      {data.damageSchedule.length > 0 ? (
        <Section title="Damage schedule">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-border print:border-black">
                <th className="py-1 pr-2">Vehicle</th>
                <th className="py-1 pr-2">Part</th>
                <th className="py-1 pr-2">Damage type</th>
                <th className="py-1 pr-2">Severity</th>
                <th className="py-1">Photo ref</th>
              </tr>
            </thead>
            <tbody>
              {data.damageSchedule.map((row, index) => (
                <tr key={index} className="border-b border-border/50 print:border-black">
                  <td className="py-1 pr-2">{row.vehicle === "own" ? "Own" : "Other"}</td>
                  <td className="py-1 pr-2">{row.part}</td>
                  <td className="py-1 pr-2">{row.damageType.replace("_", " ")}</td>
                  <td className="py-1 pr-2">{row.severity}</td>
                  <td className="py-1">{row.photoRef}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-xs text-muted-foreground print:text-black">Severity is indicative only, not a cost or fault assessment.</p>
        </Section>
      ) : null}

      {data.damagePhotos.length > 0 ? (
        <Section title="Damage photos">
          {data.damagePhotos.map((photo) => (
            <div key={photo.photoId} className="mb-4 break-inside-avoid">
              <p className="mb-1 font-medium">
                {photo.vehicle === "own" ? "Own vehicle" : "Other vehicle"} ({photo.photoRef})
              </p>
              {/* F9 item 6: the annotated photo plus the original without overlay next to it. */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <DamageOverlayCanvas
                    blobId={photo.blobId}
                    width={photo.width}
                    height={photo.height}
                    vehicleMask={photo.vehicleMask}
                    overlayItems={photo.items}
                  />
                  <p className="mt-1 text-xs text-muted-foreground print:text-black">Annotated</p>
                </div>
                <div>
                  <PhotoImage blobId={photo.blobId} alt="Original, no overlay" className="w-full rounded-md" />
                  <p className="mt-1 text-xs text-muted-foreground print:text-black">Original</p>
                </div>
              </div>
              <p className="mt-1 text-xs text-muted-foreground print:text-black">
                Captured {formatLocalDateTime(toLocalInputValue(photo.takenAt))}
              </p>
              {/* The numbered legend for each pin, same list the PDF prints under each photo. */}
              <ul className="mt-1 space-y-0.5 text-xs">
                {photo.items.map(({ item, colorIndex }) => (
                  <li key={item.id}>
                    {colorIndex + 1}. {item.part}, {item.damageType.replace("_", " ")}, {item.severity}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Section>
      ) : null}

      {data.otherPhotos.length > 0 ? (
        <Section title="Other photos">
          <div className="grid grid-cols-2 gap-3">
            {data.otherPhotos.map((photo) => (
              <div key={photo.photoId} className="break-inside-avoid">
                <PhotoImage blobId={photo.blobId} alt="Scene or vehicle photo" className="h-48 w-full rounded-md" />
                <p className="mt-1 text-xs text-muted-foreground print:text-black">
                  Captured {formatLocalDateTime(toLocalInputValue(photo.takenAt))}
                </p>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {data.otherPartyInvolved === "yes" && data.otherParties.length > 0 ? (
        <Section title="Other party details">
          {data.otherParties.map((party, index) => (
            <div key={index} className="mb-3 break-inside-avoid">
              <p className="mb-1 font-medium">Vehicle {index + 1}</p>
              {party.refusedToShare ? <p>The other driver declined to share their details.</p> : null}
              <Field label="Driver" value={party.driverName} />
              <Field label="Driver phone" value={party.driverPhone} />
              <Field label="Licence number" value={party.licenceNumber} />
              <Field label="Vehicle registration" value={party.vehicleRegistration} />
              <Field label="Vehicle make/model" value={[party.vehicleMake, party.vehicleModel].filter(Boolean).join(" ")} />
              <Field label="Owner" value={party.ownerName} />
              <Field label="Insurer" value={party.insurer} />
              <Field label="Policy/certificate no" value={party.policyOrCertificateNo} />
              {party.notes ? <Field label="Notes" value={party.notes} /> : null}
            </div>
          ))}
        </Section>
      ) : null}

      <Section title="Police report">
        <Field label="Station" value={data.police.station} />
        <Field label="OB number" value={data.police.obNumber} />
        <Field label="Date reported" value={data.police.reportedAt} />
        <Field label="Officer" value={data.police.officerName} />
        <Field label="Abstract obtained" value={data.police.abstractObtained ? "Yes" : "Not yet"} />
      </Section>

      <Section title="Witnesses">
        {data.witnessesPresent !== "yes" || data.witnesses.length === 0 ? (
          <p>No witnesses recorded.</p>
        ) : (
          data.witnesses.map((witness, index) => (
            <div key={index} className="mb-2 break-inside-avoid">
              <Field label="Name" value={witness.name} />
              {witness.phone ? <Field label="Phone" value={witness.phone} /> : null}
              <p>{witness.statement}</p>
            </div>
          ))
        )}
      </Section>

      <Section title="Documents the insurer may ask for">
        <ul className="list-none space-y-1">
          {[...data.requiredItems, ...data.checklist].map((item) => (
            <li key={item.key}>
              {item.met ? "[x]" : "[ ]"} {item.label}
            </li>
          ))}
        </ul>
      </Section>

      <p className="mt-6 text-xs text-muted-foreground print:text-black">
        Prepared by the claimant using Ajali Kit. AI marks are a guide, not an assessment.
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-5 border-t border-border py-3 print:border-black">
      <h2 className="mb-2 font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, value }: { label: string; value: string | undefined }) {
  if (!value) return null;
  return (
    <p>
      <span className="text-muted-foreground print:text-black">{label}: </span>
      {value}
    </p>
  );
}
