import Dexie, { type EntityTable } from "dexie";

import type { Incident, Photo, StoredBlob } from "./types";

// Phase 7: a small key/value table for settings that are not tied to any one
// incident (the "My vehicle" default, SPEC S03). Added as version 2 rather
// than folded into version 1, so anyone who already has a version-1 database
// on their phone upgrades cleanly instead of losing it.
export interface StoredSetting {
  id: string;
  value: unknown;
}

// IndexedDB schema for section 7 of SPEC.md. Blobs (photos, PDF) live in their
// own table so incident records stay small and quick to list.
export class AjaliDB extends Dexie {
  incidents!: EntityTable<Incident, "id">;
  photos!: EntityTable<Photo, "id">;
  blobs!: EntityTable<StoredBlob, "id">;
  settings!: EntityTable<StoredSetting, "id">;

  constructor(name = "ajali-kit") {
    super(name);
    this.version(1).stores({
      incidents: "id, status, occurredAt",
      photos: "id, incidentId, category",
      blobs: "id",
    });
    this.version(2).stores({
      incidents: "id, status, occurredAt",
      photos: "id, incidentId, category",
      blobs: "id",
      settings: "id",
    });
  }
}

export const db = new AjaliDB();
