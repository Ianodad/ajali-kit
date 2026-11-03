import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it } from "vitest";

import { db } from "../db";
import {
  buildReference,
  createIncident,
  deleteIncident,
  getBlob,
  getIncident,
  listIncidents,
  listPhotos,
  savePhoto,
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
    expect(incident.otherParties).toEqual([]);
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
