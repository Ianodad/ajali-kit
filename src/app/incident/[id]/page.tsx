"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { INCIDENT_SECTIONS } from "@/lib/incident-sections";
import { deleteIncident, getIncident } from "@/lib/incidents";
import type { Incident } from "@/lib/types";

export default function IncidentHubPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [incident, setIncident] = useState<Incident | null | undefined>(undefined);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    getIncident(params.id).then((found) => setIncident(found ?? null));
  }, [params.id]);

  async function handleDelete() {
    await deleteIncident(params.id);
    router.push("/");
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
        <p className="text-sm text-white/70">{incident.reference}</p>
        <div className="mt-1 flex items-center gap-2">
          <h1 className="text-lg font-semibold">{incident.location.text || "Incident"}</h1>
          <StatusChip status={incident.status} />
        </div>
      </header>
      <main className="flex-1 space-y-4 p-4 pb-24">
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {INCIDENT_SECTIONS.map((section) => (
            <li key={section.slug}>
              <Link
                href={`/incident/${incident.id}/${section.slug}`}
                className="flex min-h-12 items-center justify-between gap-3 px-3 py-3"
              >
                <span className="font-medium">{section.title}</span>
                <span className="text-sm text-muted-foreground">Needed ›</span>
              </Link>
            </li>
          ))}
        </ul>

        {confirmDelete ? (
          <div className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            <p className="text-sm">
              Delete this incident and all its photos? This cannot be undone.
            </p>
            <div className="flex gap-2">
              <Button variant="destructive" onClick={handleDelete}>
                Delete incident
              </Button>
              <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" onClick={() => setConfirmDelete(true)}>
            Delete incident
          </Button>
        )}
      </main>
    </div>
  );
}
