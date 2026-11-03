"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { getIncident, updateIncident } from "@/lib/incidents";
import type { Incident, Witness } from "@/lib/types";
import { useFlushOnUnmount } from "@/lib/use-flush-on-unmount";
import { cn } from "@/lib/utils";

const AUTOSAVE_DELAY_MS = 600;

function blankWitness(): Witness {
  return { id: crypto.randomUUID(), name: "", consentToContact: false, statement: "" };
}

export default function WitnessesSectionPage() {
  const params = useParams<{ id: string }>();
  const [incident, setIncident] = useState<Incident | null | undefined>(undefined);

  useEffect(() => {
    getIncident(params.id).then((found) => setIncident(found ?? null));
  }, [params.id]);

  // Autosave, same pattern as Incident basics.
  useEffect(() => {
    if (!incident) return;
    const timeout = setTimeout(() => {
      updateIncident(incident.id, { witnessesPresent: incident.witnessesPresent, witnesses: incident.witnesses });
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [incident]);

  // Flushes on unmount, so navigating away within the autosave's 600ms
  // window does not lose the last edit (P4.R finding 1).
  useFlushOnUnmount(incident, (current) => {
    if (!current) return;
    void updateIncident(current.id, { witnessesPresent: current.witnessesPresent, witnesses: current.witnesses });
  });

  function handlePresentChange(value: Incident["witnessesPresent"]) {
    setIncident((prev) => {
      if (!prev) return prev;
      const witnesses = value === "yes" && prev.witnesses.length === 0 ? [blankWitness()] : prev.witnesses;
      return { ...prev, witnessesPresent: value, witnesses };
    });
  }

  function handleAddWitness() {
    setIncident((prev) => (prev ? { ...prev, witnesses: [...prev.witnesses, blankWitness()] } : prev));
  }

  function handleRemoveWitness(witnessId: string) {
    setIncident((prev) => (prev ? { ...prev, witnesses: prev.witnesses.filter((w) => w.id !== witnessId) } : prev));
  }

  function updateWitness(witnessId: string, changes: Partial<Witness>) {
    setIncident((prev) =>
      prev ? { ...prev, witnesses: prev.witnesses.map((w) => (w.id === witnessId ? { ...w, ...changes } : w)) } : prev,
    );
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
        <h1 className="mt-1 text-lg font-semibold">Witnesses</h1>
      </header>

      <main className="flex-1 space-y-4 p-4 pb-10">
        <div className="space-y-2">
          <p className="text-sm font-medium">Did anyone see what happened?</p>
          <div className="flex gap-2">
            {[
              { value: "yes" as const, label: "Yes" },
              { value: "no" as const, label: "No" },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handlePresentChange(option.value)}
                className={cn(
                  "min-h-10 flex-1 rounded-lg border px-3 py-2 text-sm",
                  incident.witnessesPresent === option.value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {incident.witnessesPresent === "no" ? (
          <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">No witnesses. This section is done.</p>
        ) : null}

        {incident.witnessesPresent === "yes"
          ? incident.witnesses.map((witness, index) => (
              <div key={witness.id} className="space-y-3 rounded-lg border border-border bg-card p-3">
                <p className="font-medium">Witness {index + 1}</p>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-muted-foreground" htmlFor={`name-${witness.id}`}>
                    Name
                  </label>
                  <input
                    id={`name-${witness.id}`}
                    className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                    value={witness.name}
                    onChange={(e) => updateWitness(witness.id, { name: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-muted-foreground" htmlFor={`phone-${witness.id}`}>
                    Phone
                  </label>
                  <input
                    id={`phone-${witness.id}`}
                    className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                    value={witness.phone ?? ""}
                    onChange={(e) => updateWitness(witness.id, { phone: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-muted-foreground" htmlFor={`statement-${witness.id}`}>
                    What did they see? In their own words.
                  </label>
                  <textarea
                    id={`statement-${witness.id}`}
                    rows={3}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                    value={witness.statement}
                    onChange={(e) => updateWitness(witness.id, { statement: e.target.value })}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={witness.consentToContact}
                    onChange={(e) => updateWitness(witness.id, { consentToContact: e.target.checked })}
                  />
                  Witness agreed to be contacted
                </label>
                {!witness.consentToContact && witness.phone ? (
                  <p className="text-xs text-muted-foreground">
                    Without this tick, the phone number will be left out of the claim pack.
                  </p>
                ) : null}
                {incident.witnesses.length > 1 ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => handleRemoveWitness(witness.id)}>
                    Remove this witness
                  </Button>
                ) : null}
              </div>
            ))
          : null}

        {incident.witnessesPresent === "yes" ? (
          <Button type="button" variant="outline" onClick={handleAddWitness}>
            Add witness
          </Button>
        ) : null}
      </main>
    </div>
  );
}
