"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { BottomActionBar } from "@/components/bottom-action-bar";
import { Button } from "@/components/ui/button";
import { fromLocalInputValue, toLocalInputValue } from "@/lib/datetime";
import { getCurrentPosition } from "@/lib/geolocation";
import { getIncident, updateIncident } from "@/lib/incidents";
import type { Incident } from "@/lib/types";
import { cn } from "@/lib/utils";

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

  useEffect(() => {
    getIncident(params.id).then((found) => setIncident(found ?? null));
  }, [params.id]);

  useEffect(() => {
    if (!incident || locationAttempted.current) return;
    locationAttempted.current = true;
    if (incident.location.lat !== undefined) return;
    getCurrentPosition().then((result) => {
      if (!result) {
        setLocationUnavailable(true);
        return;
      }
      setIncident((prev) =>
        prev ? { ...prev, location: { ...prev.location, lat: result.lat, lng: result.lng, accuracyM: result.accuracyM } } : prev,
      );
    });
  }, [incident]);

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
    await updateIncident(incident.id, {
      occurredAt: incident.occurredAt,
      location: incident.location,
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
            onChange={(e) =>
              setIncident((prev) => (prev ? { ...prev, occurredAt: fromLocalInputValue(e.target.value) } : prev))
            }
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
