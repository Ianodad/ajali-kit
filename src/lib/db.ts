import Dexie, { type EntityTable } from "dexie";

import type { Incident, Photo, StoredBlob } from "./types";

// IndexedDB schema for section 7 of SPEC.md. Blobs (photos, PDF) live in their
// own table so incident records stay small and quick to list.
export class AjaliDB extends Dexie {
  incidents!: EntityTable<Incident, "id">;
  photos!: EntityTable<Photo, "id">;
  blobs!: EntityTable<StoredBlob, "id">;

  constructor(name = "ajali-kit") {
    super(name);
    this.version(1).stores({
      incidents: "id, status, occurredAt",
      photos: "id, incidentId, category",
      blobs: "id",
    });
  }
}

export const db = new AjaliDB();
