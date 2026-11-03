import { db } from "./db";
import type { ClaimAccount, Incident, OtherParty, OwnVehicle, Photo, PoliceReport, StoredBlob, Witness } from "./types";

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
  anyoneInjured?: boolean | null;
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
    anyoneInjured: input.anyoneInjured ?? null,
    ownVehicle: input.ownVehicle ?? { registration: "" },
    otherPartyInvolved: null,
    otherParties: [],
    police: { abstractObtained: false, reviewed: false },
    witnessesPresent: null,
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
  // Parse to a timestamp rather than comparing strings: section 7 allows any
  // UTC offset, and two offsets can sort wrong as plain strings (for example
  // "10:00+03:00" vs "08:00Z", where the second is later despite the smaller
  // hour).
  return all.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
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

export async function updatePhoto(id: string, changes: Partial<Photo>): Promise<void> {
  await db.photos.update(id, changes);
}

// Removes one photo and its blobs, for example after a "too dark, retake?"
// quality warning. Unlike deleteIncident, this leaves the incident alone.
export async function deletePhoto(id: string): Promise<void> {
  await db.transaction("rw", db.photos, db.blobs, async () => {
    const photo = await db.photos.get(id);
    if (!photo) return;
    await db.blobs.bulkDelete([photo.blobId, photo.thumbBlobId]);
    await db.photos.delete(id);
  });
}

export function getBlob(id: string): Promise<StoredBlob | undefined> {
  return db.blobs.get(id);
}

// F5: "Was another vehicle involved?" Yes / No / Not sure.
export async function setOtherPartyInvolved(incidentId: string, value: Incident["otherPartyInvolved"]): Promise<void> {
  await updateIncident(incidentId, { otherPartyInvolved: value });
}

export async function addOtherParty(incidentId: string): Promise<OtherParty> {
  const incident = await getIncident(incidentId);
  if (!incident) throw new Error("Incident not found");
  const party: OtherParty = { id: crypto.randomUUID(), driver: {}, vehicle: {}, refusedToShare: false, confirmed: false };
  await updateIncident(incidentId, { otherParties: [...incident.otherParties, party] });
  return party;
}

export async function updateOtherParty(
  incidentId: string,
  partyId: string,
  updater: Partial<OtherParty> | ((party: OtherParty) => OtherParty),
): Promise<void> {
  const incident = await getIncident(incidentId);
  if (!incident) return;
  const otherParties = incident.otherParties.map((party) =>
    party.id !== partyId ? party : typeof updater === "function" ? updater(party) : { ...party, ...updater },
  );
  await updateIncident(incidentId, { otherParties });
}

export async function deleteOtherParty(incidentId: string, partyId: string): Promise<void> {
  const incident = await getIncident(incidentId);
  if (!incident) return;
  await updateIncident(incidentId, { otherParties: incident.otherParties.filter((party) => party.id !== partyId) });
}

export async function updatePoliceReport(incidentId: string, changes: Partial<PoliceReport>): Promise<void> {
  const incident = await getIncident(incidentId);
  if (!incident) return;
  await updateIncident(incidentId, { police: { ...incident.police, ...changes } });
}

// F7: "Did anyone see what happened?" Yes / No.
export async function setWitnessesPresent(incidentId: string, value: Incident["witnessesPresent"]): Promise<void> {
  await updateIncident(incidentId, { witnessesPresent: value });
}

export async function addWitness(incidentId: string): Promise<Witness> {
  const incident = await getIncident(incidentId);
  if (!incident) throw new Error("Incident not found");
  const witness: Witness = { id: crypto.randomUUID(), name: "", consentToContact: false, statement: "" };
  await updateIncident(incidentId, { witnesses: [...incident.witnesses, witness] });
  return witness;
}

export async function updateWitness(incidentId: string, witnessId: string, changes: Partial<Witness>): Promise<void> {
  const incident = await getIncident(incidentId);
  if (!incident) return;
  const witnesses = incident.witnesses.map((witness) => (witness.id === witnessId ? { ...witness, ...changes } : witness));
  await updateIncident(incidentId, { witnesses });
}

export async function deleteWitness(incidentId: string, witnessId: string): Promise<void> {
  const incident = await getIncident(incidentId);
  if (!incident) return;
  await updateIncident(incidentId, { witnesses: incident.witnesses.filter((witness) => witness.id !== witnessId) });
}

export async function updateClaimAccount(incidentId: string, changes: Partial<ClaimAccount>): Promise<void> {
  const incident = await getIncident(incidentId);
  if (!incident) return;
  await updateIncident(incidentId, { account: { ...incident.account, ...changes } });
}
