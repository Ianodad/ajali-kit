import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it } from "vitest";

import { AjaliDB, db } from "../db";
import type { DamageAnalysis } from "../types";
import {
  addOtherParty,
  addWitness,
  buildReference,
  createIncident,
  deleteIncident,
  deleteOtherParty,
  deletePhoto,
  deleteWitness,
  getBlob,
  getIncident,
  listIncidents,
  listPhotos,
  savePhoto,
  setOtherPartyInvolved,
  setWitnessesPresent,
  updateOtherParty,
  updatePhoto,
  updatePoliceReport,
  updateWitness,
} from "../incidents";

beforeEach(async () => {
  await db.incidents.clear();
  await db.photos.clear();
  await db.blobs.clear();
});

describe("buildReference", () => {
  it("formats AJK-YYYYMMDD-XXXX with an uppercase hex suffix", () => {
    const reference = buildReference(new Date("2026-11-03T12:00:00+03:00"));
    expect(reference).toMatch(/^AJK-20261103-[0-9A-F]{4}$/);
  });
});

describe("createIncident", () => {
  it("creates a draft incident and persists it", async () => {
    const incident = await createIncident();

    expect(incident.status).toBe("draft");
    expect(incident.otherPartyInvolved).toBeNull();
    expect(incident.otherParties).toEqual([]);
    expect(incident.witnessesPresent).toBeNull();
    expect(incident.police).toEqual({ abstractObtained: false, reviewed: false });
    expect(incident.id).toBeTruthy();

    const stored = await getIncident(incident.id);
    expect(stored).toEqual(incident);
  });

  it("uses a given occurredAt and own vehicle snapshot", async () => {
    const incident = await createIncident({
      occurredAt: "2026-01-02T10:00:00+03:00",
      ownVehicle: { registration: "KDA 123A" },
    });

    expect(incident.occurredAt).toBe("2026-01-02T10:00:00+03:00");
    expect(incident.ownVehicle.registration).toBe("KDA 123A");
  });
});

describe("listIncidents", () => {
  it("lists incidents most recent occurredAt first", async () => {
    const older = await createIncident({ occurredAt: "2026-01-01T00:00:00+03:00" });
    const newer = await createIncident({ occurredAt: "2026-02-01T00:00:00+03:00" });

    const all = await listIncidents();

    expect(all.map((incident) => incident.id)).toEqual([newer.id, older.id]);
  });

  it("orders by actual time, not by ISO string, across different UTC offsets", async () => {
    // "10:00+03:00" is 07:00 UTC; "08:00Z" is 08:00 UTC, so it happened later,
    // even though its string sorts lower. A plain string sort gets this backwards.
    const earlier = await createIncident({ occurredAt: "2026-01-01T10:00:00+03:00" });
    const later = await createIncident({ occurredAt: "2026-01-01T08:00:00Z" });

    const all = await listIncidents();

    expect(all.map((incident) => incident.id)).toEqual([later.id, earlier.id]);
  });
});

// A2: "An incident with 10 photos survives closing and reopening the browser."
// Closing the browser means the Dexie instance is gone but the underlying
// IndexedDB data is not, so this opens a second connection to the same
// database name rather than reusing the `db` singleton.
describe("A2: local storage", () => {
  it("keeps an incident and 10 photos after the database is reopened", async () => {
    const incident = await createIncident();
    for (let i = 0; i < 10; i += 1) {
      await savePhoto({
        incidentId: incident.id,
        category: "scene",
        blob: new Blob([`photo-${i}`]),
        thumbBlob: new Blob([`thumb-${i}`]),
        width: 100,
        height: 100,
      });
    }

    const reopened = new AjaliDB();
    const storedIncident = await reopened.incidents.get(incident.id);
    const storedPhotos = await reopened.photos.where("incidentId").equals(incident.id).toArray();
    reopened.close();

    expect(storedIncident).toEqual(incident);
    expect(storedPhotos).toHaveLength(10);
  });

  it("deletes every blob belonging to the incident, verified by blob count", async () => {
    const incident = await createIncident();
    for (let i = 0; i < 3; i += 1) {
      await savePhoto({
        incidentId: incident.id,
        category: "scene",
        blob: new Blob([`photo-${i}`]),
        thumbBlob: new Blob([`thumb-${i}`]),
        width: 100,
        height: 100,
      });
    }
    expect(await db.blobs.count()).toBe(6);

    await deleteIncident(incident.id);

    expect(await db.blobs.count()).toBe(0);
  });
});

describe("deleteIncident", () => {
  it("removes the incident, its photos and their blobs", async () => {
    const incident = await createIncident();
    const photo = await savePhoto({
      incidentId: incident.id,
      category: "scene",
      blob: new Blob(["photo"]),
      thumbBlob: new Blob(["thumb"]),
      width: 100,
      height: 100,
    });

    await deleteIncident(incident.id);

    expect(await getIncident(incident.id)).toBeUndefined();
    expect(await listPhotos(incident.id)).toHaveLength(0);
    expect(await getBlob(photo.blobId)).toBeUndefined();
    expect(await getBlob(photo.thumbBlobId)).toBeUndefined();
  });

  it("leaves other incidents and their photos untouched", async () => {
    const keep = await createIncident();
    const keepPhoto = await savePhoto({
      incidentId: keep.id,
      category: "scene",
      blob: new Blob(["photo"]),
      thumbBlob: new Blob(["thumb"]),
      width: 100,
      height: 100,
    });
    const remove = await createIncident();

    await deleteIncident(remove.id);

    expect(await getIncident(keep.id)).toBeTruthy();
    expect(await listPhotos(keep.id)).toEqual([keepPhoto]);
  });
});

describe("deletePhoto", () => {
  it("removes one photo and its blobs, leaving the incident and other photos", async () => {
    const incident = await createIncident();
    const keep = await savePhoto({
      incidentId: incident.id,
      category: "scene",
      blob: new Blob(["keep"]),
      thumbBlob: new Blob(["keep-thumb"]),
      width: 100,
      height: 100,
    });
    const remove = await savePhoto({
      incidentId: incident.id,
      category: "own_damage",
      blob: new Blob(["too dark"]),
      thumbBlob: new Blob(["too dark thumb"]),
      width: 100,
      height: 100,
    });

    await deletePhoto(remove.id);

    expect(await getIncident(incident.id)).toBeTruthy();
    expect(await listPhotos(incident.id)).toEqual([keep]);
    expect(await getBlob(remove.blobId)).toBeUndefined();
    expect(await getBlob(remove.thumbBlobId)).toBeUndefined();
    expect(await getBlob(keep.blobId)).toBeTruthy();
  });

  it("does nothing if the photo does not exist", async () => {
    await expect(deletePhoto("missing")).resolves.toBeUndefined();
  });
});

describe("updatePhoto", () => {
  it("merges changes into the stored photo, leaving other fields alone", async () => {
    const incident = await createIncident();
    const photo = await savePhoto({
      incidentId: incident.id,
      category: "own_damage",
      blob: new Blob(["photo"]),
      thumbBlob: new Blob(["thumb"]),
      width: 100,
      height: 100,
    });

    const analysis: DamageAnalysis = {
      model: "mock",
      analysedAt: "2026-11-03T12:00:00+03:00",
      isVehiclePhoto: true,
      items: [],
    };
    await updatePhoto(photo.id, { analysis });

    const stored = await listPhotos(incident.id);
    expect(stored).toHaveLength(1);
    expect(stored[0].analysis).toEqual(analysis);
    expect(stored[0].category).toBe("own_damage");
  });
});

describe("other party helpers", () => {
  it("records the Yes/No/Not sure answer", async () => {
    const incident = await createIncident();
    await setOtherPartyInvolved(incident.id, "unsure");
    expect((await getIncident(incident.id))?.otherPartyInvolved).toBe("unsure");
  });

  it("adds, updates and removes a party", async () => {
    const incident = await createIncident();
    const party = await addOtherParty(incident.id);
    expect((await getIncident(incident.id))?.otherParties).toHaveLength(1);

    await updateOtherParty(incident.id, party.id, { confirmed: true });
    expect((await getIncident(incident.id))?.otherParties[0].confirmed).toBe(true);

    await updateOtherParty(incident.id, party.id, (p) => ({ ...p, notes: "via updater" }));
    expect((await getIncident(incident.id))?.otherParties[0].notes).toBe("via updater");

    await deleteOtherParty(incident.id, party.id);
    expect((await getIncident(incident.id))?.otherParties).toHaveLength(0);
  });
});

describe("updatePoliceReport", () => {
  it("merges changes into the existing police report", async () => {
    const incident = await createIncident();
    await updatePoliceReport(incident.id, { station: "Central", obNumber: "" });
    await updatePoliceReport(incident.id, { reviewed: true });

    const stored = await getIncident(incident.id);
    expect(stored?.police).toEqual({ station: "Central", obNumber: "", abstractObtained: false, reviewed: true });
  });
});

describe("witness helpers", () => {
  it("records the Yes/No answer", async () => {
    const incident = await createIncident();
    await setWitnessesPresent(incident.id, "yes");
    expect((await getIncident(incident.id))?.witnessesPresent).toBe("yes");
  });

  it("adds, updates and removes a witness", async () => {
    const incident = await createIncident();
    const witness = await addWitness(incident.id);
    expect((await getIncident(incident.id))?.witnesses).toHaveLength(1);

    await updateWitness(incident.id, witness.id, { name: "Jane", consentToContact: true });
    const updated = await getIncident(incident.id);
    expect(updated?.witnesses[0]).toMatchObject({ name: "Jane", consentToContact: true });

    await deleteWitness(incident.id, witness.id);
    expect((await getIncident(incident.id))?.witnesses).toHaveLength(0);
  });
});
