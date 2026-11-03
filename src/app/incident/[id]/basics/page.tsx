"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { BottomActionBar } from "@/components/bottom-action-bar";
import { Button } from "@/components/ui/button";
import { fromLocalInputValue, toLocalInputValue } from "@/lib/datetime";
import { getCurrentPosition, type GeoResult } from "@/lib/geolocation";
import { getIncident, updateIncident } from "@/lib/incidents";
import type { Incident } from "@/lib/types";
import { useFlushOnUnmount } from "@/lib/use-flush-on-unmount";
import { cn } from "@/lib/utils";

const AUTOSAVE_DELAY_MS = 600;

const WEATHER_LIGHT_CHIPS = [
  { label: "Clear", field: "weather" as const, value: "clear" as const },
  { label: "Rain", field: "weather" as const, value: "rain" as const },
  { label: "Night", field: "light" as const, value: "night" as const },
  { label: "Dusk", field: "light" as const, value: "dusk" as const },
];

const ROAD_CHIPS = ["Tarmac", "Murram", "Junction", "Roundabout"];

export default function IncidentBasicsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [incident, setIncident] = useState<Incident | null | undefined>(undefined);
  const [locationUnavailable, setLocationUnavailable] = useState(false);
  const [saving, setSaving] = useState(false);
  const locationAttempted = useRef(false);
  // Continue can race a still-pending GPS fix (SPEC F2 asks for "location
  // captured when allowed"): holding the promise here lets handleContinue
  // await it instead of saving whatever happened to be in state yet.
  const locationPromise = useRef<Promise<GeoResult | null> | null>(null);

  useEffect(() => {
    getIncident(params.id).then((found) => setIncident(found ?? null));
  }, [params.id]);

  useEffect(() => {
    if (!incident || locationAttempted.current) return;
    locationAttempted.current = true;
    if (incident.location.lat !== undefined) return;
    const promise = getCurrentPosition();
    locationPromise.current = promise;
    promise.then((result) => {
      if (!result) {
        setLocationUnavailable(true);
        return;
      }
      setIncident((prev) =>
        prev ? { ...prev, location: { ...prev.location, lat: result.lat, lng: result.lng, accuracyM: result.accuracyM } } : prev,
      );
    });
  }, [incident]);

  // Autosave (SPEC F2 edge state: "User leaves mid-flow: everything
  // autosaves"), so a reload or an interrupted session keeps the edits made
  // so far, not just whatever was in place the last time Continue was
  // tapped.
  useEffect(() => {
    if (!incident) return;
    const timeout = setTimeout(() => {
      updateIncident(incident.id, {
        occurredAt: incident.occurredAt,
        location: incident.location,
        shortDescription: incident.shortDescription,
        conditions: incident.conditions,
      });
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [incident]);

  // Flushes on unmount, so navigating away (Continue, Back, or straight to
  // another route) within the autosave's 600ms window does not lose the
  // last edit, same P4.R finding 1 fix every other section already has;
  // this page was missed when that fix went in (browser-run bug b).
  useFlushOnUnmount(incident, (current) => {
    if (!current) return;
    void updateIncident(current.id, {
      occurredAt: current.occurredAt,
      location: current.location,
      shortDescription: current.shortDescription,
      conditions: current.conditions,
    });
  });

  if (incident === undefined) {
    return <p className="p-4 text-sm text-muted-foreground">Loading.</p>;
  }
  if (incident === null) {
    return <p className="p-4 text-sm text-muted-foreground">Incident not found.</p>;
  }

  function toggleWeatherLight(field: "weather" | "light", value: string) {
    setIncident((prev) => {
      if (!prev) return prev;
      const current = prev.conditions[field];
      return {
        ...prev,
        conditions: { ...prev.conditions, [field]: current === value ? undefined : value },
      };
    });
  }

  function toggleRoad(label: string) {
    setIncident((prev) => {
      if (!prev) return prev;
      const current = prev.conditions.road ?? [];
      const road = current.includes(label) ? current.filter((r) => r !== label) : [...current, label];
      return { ...prev, conditions: { ...prev.conditions, road } };
    });
  }

  async function handleContinue() {
    if (!incident || saving) return;
    setSaving(true);
    let location = incident.location;
    const pendingLocation = locationPromise.current ? await locationPromise.current : null;
    if (pendingLocation) {
      location = { ...location, lat: pendingLocation.lat, lng: pendingLocation.lng, accuracyM: pendingLocation.accuracyM };
    }
    await updateIncident(incident.id, {
      occurredAt: incident.occurredAt,
      location,
      shortDescription: incident.shortDescription,
      conditions: incident.conditions,
    });
    router.push(`/incident/${incident.id}`);
  }

  const { lat, lng } = incident.location;
  const mapsHref = lat !== undefined && lng !== undefined ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}` : null;

  return (
    <div className="flex flex-1 flex-col">
      <header className="bg-navy px-4 py-6 text-white">
        <h1 className="text-lg font-semibold">Incident basics</h1>
      </header>
      <main className="flex-1 space-y-5 p-4 pb-28">
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="occurredAt">
            Date and time
          </label>
          <input
            id="occurredAt"
            type="datetime-local"
            value={toLocalInputValue(incident.occurredAt)}
            onChange={(e) => {
              // An empty value (user cleared the field) is not a valid date:
              // fromLocalInputValue would throw. Keep the last known value.
              if (!e.target.value) return;
              setIncident((prev) => (prev ? { ...prev, occurredAt: fromLocalInputValue(e.target.value) } : prev));
            }}
            className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
          />
        </div>

        <div className="space-y-1">
          <p className="text-sm font-medium">Location</p>
          {lat !== undefined && lng !== undefined ? (
            <p className="text-sm text-muted-foreground">
              {lat.toFixed(5)}, {lng.toFixed(5)}
              {mapsHref ? (
                <>
                  {" "}
                  <a href={mapsHref} target="_blank" rel="noreferrer" className="font-medium text-primary underline-offset-4 hover:underline">
                    Open in Maps
                  </a>
                </>
              ) : null}
            </p>
          ) : locationUnavailable ? (
            <p className="text-sm text-muted-foreground">Location off. Type the place instead.</p>
          ) : null}
          <label className="sr-only" htmlFor="locationText">
            Road or landmark
          </label>
          <input
            id="locationText"
            type="text"
            placeholder="Road or landmark, for example Mombasa Road near Capital Centre"
            value={incident.location.text}
            onChange={(e) =>
              setIncident((prev) => (prev ? { ...prev, location: { ...prev.location, text: e.target.value } } : prev))
            }
            className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="shortDescription">
            What happened, in a few words?
          </label>
          <textarea
            id="shortDescription"
            value={incident.shortDescription ?? ""}
            onChange={(e) =>
              setIncident((prev) => (prev ? { ...prev, shortDescription: e.target.value } : prev))
            }
            rows={3}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Weather and light</p>
          <div className="flex flex-wrap gap-2">
            {WEATHER_LIGHT_CHIPS.map((chip) => {
              const active = incident.conditions[chip.field] === chip.value;
              return (
                <button
                  key={chip.label}
                  type="button"
                  onClick={() => toggleWeatherLight(chip.field, chip.value)}
                  className={cn(
                    "min-h-9 rounded-full border px-3 py-1.5 text-sm",
                    active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card",
                  )}
                >
                  {chip.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Road</p>
          <div className="flex flex-wrap gap-2">
            {ROAD_CHIPS.map((label) => {
              const active = (incident.conditions.road ?? []).includes(label);
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => toggleRoad(label)}
                  className={cn(
                    "min-h-9 rounded-full border px-3 py-1.5 text-sm",
                    active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </main>
      <BottomActionBar>
        <Button type="button" className="w-full" disabled={saving} onClick={handleContinue}>
          Continue
        </Button>
      </BottomActionBar>
    </div>
  );
}
