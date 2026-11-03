import { db } from "./db";
import type { Incident, OwnVehicle, Photo, StoredBlob } from "./types";

function pad(n: number, width: number): string {
  return n.toString().padStart(width, "0");
}

// "AJK-YYYYMMDD-XXXX" per SPEC section 7. The suffix is 4 random hex chars,
// not sequential: it only needs to be unlikely to collide on the same day.
export function buildReference(date: Date): string {
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1, 2);
  const d = pad(date.getDate(), 2);
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 4).toUpperCase();
  return `AJK-${y}${m}${d}-${suffix}`;
}

export interface CreateIncidentInput {
  occurredAt?: string;
  ownVehicle?: OwnVehicle;
}

export async function createIncident(input: CreateIncidentInput = {}): Promise<Incident> {
  const now = new Date().toISOString();
  const occurredAt = input.occurredAt ?? now;
  const incident: Incident = {
    id: crypto.randomUUID(),
    reference: buildReference(new Date(occurredAt)),
    status: "draft",
    createdAt: now,
    updatedAt: now,
    occurredAt,
    location: { text: "" },
    conditions: {},
    anyoneInjured: null,
    ownVehicle: input.ownVehicle ?? { registration: "" },
    otherParties: [],
    police: { abstractObtained: false },
    witnesses: [],
    account: { userWords: "", confirmed: false },
    aiConsent: false,
  };
  await db.incidents.add(incident);
  return incident;
}

export function getIncident(id: string): Promise<Incident | undefined> {
  return db.incidents.get(id);
}

export async function listIncidents(): Promise<Incident[]> {
  const all = await db.incidents.toArray();
  return all.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

export async function updateIncident(id: string, changes: Partial<Incident>): Promise<void> {
  await db.incidents.update(id, { ...changes, updatedAt: new Date().toISOString() });
}

// Removes the incident and every photo and blob that belongs to it (A2: delete
// must remove photos too, not just the incident record).
export async function deleteIncident(id: string): Promise<void> {
  await db.transaction("rw", db.incidents, db.photos, db.blobs, async () => {
    const photos = await db.photos.where("incidentId").equals(id).toArray();
    const blobIds = photos.flatMap((p) => [p.blobId, p.thumbBlobId]);
    if (blobIds.length) {
      await db.blobs.bulkDelete(blobIds);
    }
    await db.photos.where("incidentId").equals(id).delete();
    await db.incidents.delete(id);
  });
}

export interface SavePhotoInput {
  incidentId: string;
  category: Photo["category"];
  docType?: Photo["docType"];
  otherPartyId?: string;
  blob: Blob;
  thumbBlob: Blob;
  width: number;
  height: number;
  takenAt?: string;
  lat?: number;
  lng?: number;
}

export async function savePhoto(input: SavePhotoInput): Promise<Photo> {
  const blobId = crypto.randomUUID();
  const thumbBlobId = crypto.randomUUID();
  const photo: Photo = {
    id: crypto.randomUUID(),
    incidentId: input.incidentId,
    category: input.category,
    docType: input.docType,
    otherPartyId: input.otherPartyId,
    blobId,
    thumbBlobId,
    width: input.width,
    height: input.height,
    takenAt: input.takenAt ?? new Date().toISOString(),
    lat: input.lat,
    lng: input.lng,
  };
  await db.transaction("rw", db.photos, db.blobs, async () => {
    await db.blobs.bulkAdd([
      { id: blobId, blob: input.blob, mime: input.blob.type },
      { id: thumbBlobId, blob: input.thumbBlob, mime: input.thumbBlob.type },
    ]);
    await db.photos.add(photo);
  });
  return photo;
}

export function listPhotos(incidentId: string): Promise<Photo[]> {
  return db.photos.where("incidentId").equals(incidentId).toArray();
}

export function getBlob(id: string): Promise<StoredBlob | undefined> {
  return db.blobs.get(id);
}
