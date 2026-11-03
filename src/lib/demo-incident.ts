import type { PixelBox } from "./box-convert";
import {
  addOtherParty,
  addWitness,
  createIncident,
  getIncident,
  savePhoto,
  setOtherPartyInvolved,
  setWitnessesPresent,
  updateClaimAccount,
  updateIncident,
  updateOtherParty,
  updatePhoto,
  updatePoliceReport,
  updateWitness,
} from "./incidents";
import { buildMockBoxMasks, buildMockVehicleMask } from "./mock/segment-mock";
import type { DamageAnalysis, Incident } from "./types";

// P7.2: one button, dev only (NEXT_PUBLIC_SHOW_DEV=1 or mock mode), that
// builds a complete demo incident so the demo flow always works even with
// no network. Every photo here is drawn on a canvas at click time, not a
// real photo: a plain grey rectangle for the body, a dark patch for the
// "damaged" area, and a caption saying it is a demo. No personal data
// anywhere in this file.

const DEMO_PHOTO_WIDTH = 1200;
const DEMO_PHOTO_HEIGHT = 900;
const DEMO_THUMB_WIDTH = 320;

function drawDemoCar(ctx: CanvasRenderingContext2D, width: number, height: number, bodyColor: string, damageRectNorm?: [number, number, number, number]) {
  ctx.fillStyle = "#e2e8f0";
  ctx.fillRect(0, 0, width, height);

  const carX = width * 0.12;
  const carY = height * 0.32;
  const carW = width * 0.76;
  const carH = height * 0.36;
  ctx.fillStyle = bodyColor;
  ctx.fillRect(carX, carY, carW, carH);

  ctx.fillStyle = "#111827";
  const wheelRadius = height * 0.07;
  for (const wheelX of [carX + carW * 0.22, carX + carW * 0.78]) {
    ctx.beginPath();
    ctx.arc(wheelX, carY + carH, wheelRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  if (damageRectNorm) {
    const [x1, y1, x2, y2] = damageRectNorm;
    ctx.fillStyle = "#b91c1c";
    ctx.fillRect(carX + x1 * carW, carY + y1 * carH, (x2 - x1) * carW, (y2 - y1) * carH);
  }

  ctx.fillStyle = "#1f2937";
  ctx.font = `${Math.round(height * 0.035)}px sans-serif`;
  ctx.fillText("Demo photo, not a real car", width * 0.08, height * 0.92);
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not create the demo image."))), "image/jpeg", quality);
  });
}

async function drawDemoPhoto(
  bodyColor: string,
  damageRectNorm?: [number, number, number, number],
): Promise<{ blob: Blob; thumbBlob: Blob; width: number; height: number }> {
  const canvas = document.createElement("canvas");
  canvas.width = DEMO_PHOTO_WIDTH;
  canvas.height = DEMO_PHOTO_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available.");
  drawDemoCar(ctx, DEMO_PHOTO_WIDTH, DEMO_PHOTO_HEIGHT, bodyColor, damageRectNorm);

  const thumbHeight = Math.round((DEMO_THUMB_WIDTH / DEMO_PHOTO_WIDTH) * DEMO_PHOTO_HEIGHT);
  const thumbCanvas = document.createElement("canvas");
  thumbCanvas.width = DEMO_THUMB_WIDTH;
  thumbCanvas.height = thumbHeight;
  const thumbCtx = thumbCanvas.getContext("2d");
  if (!thumbCtx) throw new Error("Canvas is not available.");
  thumbCtx.drawImage(canvas, 0, 0, DEMO_THUMB_WIDTH, thumbHeight);

  const [blob, thumbBlob] = await Promise.all([canvasToJpegBlob(canvas, 0.85), canvasToJpegBlob(thumbCanvas, 0.7)]);
  return { blob, thumbBlob, width: DEMO_PHOTO_WIDTH, height: DEMO_PHOTO_HEIGHT };
}

function minutesAgo(now: Date, minutes: number): string {
  return new Date(now.getTime() - minutes * 60 * 1000).toISOString();
}

export async function createDemoIncident(): Promise<Incident> {
  const now = new Date();
  const occurredAt = minutesAgo(now, 45);

  const incident = await createIncident({
    occurredAt,
    anyoneInjured: false,
    ownVehicle: {
      registration: "KDA 123A",
      make: "Toyota",
      model: "Axio",
      colour: "Silver",
      insurer: "your insurer",
      policyNumber: "DEMO-POLICY-01",
    },
  });

  await updateIncident(incident.id, {
    location: { text: "Mombasa Road near Capital Centre, Nairobi", lat: -1.3, lng: 36.82, accuracyM: 20 },
    conditions: { weather: "clear", light: "day", road: ["tarmac"] },
    shortDescription: "Rear-end collision at traffic lights.",
    aiConsent: true,
  });

  const damagePhoto = await drawDemoPhoto("#64748b", [0.55, 0.45, 0.95, 0.9]);
  const savedDamagePhoto = await savePhoto({
    incidentId: incident.id,
    category: "own_damage",
    blob: damagePhoto.blob,
    thumbBlob: damagePhoto.thumbBlob,
    width: damagePhoto.width,
    height: damagePhoto.height,
    takenAt: occurredAt,
  });
  // Both the box and the SAM mask for each item, plus the vehicle outline,
  // use the same mock-mask builder /api/segment's own mock branch uses
  // (segment-mock.ts), so the demo incident shows real, geometry-consistent
  // masks in the damage review canvas and the PDF, not just dashed box
  // outlines (Codex review finding 5: a demo with no masks cannot show the
  // SAM 3.1 segmentation step the pitch is built around).
  const item1Box: PixelBox = {
    left: Math.round(damagePhoto.width * 0.36),
    top: Math.round(damagePhoto.height * 0.62),
    right: Math.round(damagePhoto.width * 0.7),
    bottom: Math.round(damagePhoto.height * 0.82),
  };
  const item2Box: PixelBox = {
    left: Math.round(damagePhoto.width * 0.7),
    top: Math.round(damagePhoto.height * 0.54),
    right: Math.round(damagePhoto.width * 0.86),
    bottom: Math.round(damagePhoto.height * 0.7),
  };
  const [itemMask1, itemMask2] = buildMockBoxMasks([
    { id: 1, box: item1Box },
    { id: 2, box: item2Box },
  ]);
  const vehicleMask = buildMockVehicleMask(damagePhoto.width, damagePhoto.height);

  const analysis: DamageAnalysis = {
    model: "demo-fixture",
    analysedAt: occurredAt,
    isVehiclePhoto: true,
    vehicleSide: "rear",
    vehicleMask: {
      svgPath: vehicleMask.svgPath,
      boxPx: { left: 0, top: 0, right: damagePhoto.width, bottom: damagePhoto.height },
      rasterWidth: vehicleMask.rasterWidth,
      rasterHeight: vehicleMask.rasterHeight,
      areaPx: vehicleMask.areaPx,
    },
    items: [
      {
        id: crypto.randomUUID(),
        samObjectId: 1,
        part: "rear bumper",
        damageType: "dent",
        severity: "moderate",
        description: "A moderate dent spans the centre of the rear bumper.",
        boxNorm: [360, 620, 700, 820],
        boxPx: item1Box,
        maskSvgPath: itemMask1.svgPath,
        maskBoxPx: item1Box,
        maskRasterWidth: itemMask1.rasterWidth,
        maskRasterHeight: itemMask1.rasterHeight,
        maskAreaPx: itemMask1.areaPx,
        shareOfVehicle: itemMask1.areaPx / vehicleMask.areaPx,
        source: "ai",
        status: "confirmed",
      },
      {
        id: crypto.randomUUID(),
        samObjectId: 2,
        part: "left rear light",
        damageType: "broken",
        severity: "severe",
        description: "The left rear light cluster is cracked and partly detached.",
        boxNorm: [700, 540, 860, 700],
        boxPx: item2Box,
        maskSvgPath: itemMask2.svgPath,
        maskBoxPx: item2Box,
        maskRasterWidth: itemMask2.rasterWidth,
        maskRasterHeight: itemMask2.rasterHeight,
        maskAreaPx: itemMask2.areaPx,
        shareOfVehicle: itemMask2.areaPx / vehicleMask.areaPx,
        source: "ai",
        status: "confirmed",
      },
    ],
  };
  await updatePhoto(savedDamagePhoto.id, { analysis });

  const scenePhoto = await drawDemoPhoto("#475569");
  await savePhoto({
    incidentId: incident.id,
    category: "scene",
    blob: scenePhoto.blob,
    thumbBlob: scenePhoto.thumbBlob,
    width: scenePhoto.width,
    height: scenePhoto.height,
    takenAt: occurredAt,
  });

  await setOtherPartyInvolved(incident.id, "yes");
  const party = await addOtherParty(incident.id);
  await updateOtherParty(incident.id, party.id, {
    driver: {
      name: { value: "Demo Driver", confidence: "high", userConfirmed: true },
      licenceNumber: { value: "DL-DEMO-001", confidence: "high", userConfirmed: true },
    },
    vehicle: {
      registration: { value: "KBZ 456B", confidence: "high", userConfirmed: true },
      make: { value: "Nissan", confidence: "high", userConfirmed: true },
      model: { value: "Note", confidence: "medium", userConfirmed: true },
    },
    insurance: {
      insurer: { value: "their insurer", confidence: "medium", userConfirmed: true },
      policyOrCertificateNo: { value: "POL-DEMO-9", confidence: "medium", userConfirmed: true },
    },
    confirmed: true,
  });

  await updatePoliceReport(incident.id, {
    station: "Capitol Hill Police Station",
    obNumber: "OB/45/DEMO",
    reportedAt: minutesAgo(now, 20).slice(0, 10),
    abstractObtained: false,
    reviewed: true,
  });

  await setWitnessesPresent(incident.id, "yes");
  const witness = await addWitness(incident.id);
  await updateWitness(incident.id, witness.id, {
    name: "Demo Witness",
    phone: "0700000000",
    consentToContact: true,
    statement: "I saw the other car hit the back of the stopped car.",
  });

  const draftedAt = minutesAgo(now, 10);
  const finalText =
    "I was stopped at the traffic lights on Mombasa Road when another vehicle struck the rear of my car, denting the rear bumper and breaking the left rear light.";
  await updateClaimAccount(incident.id, {
    userWords: "I was hit from behind while stopped at the lights on Mombasa Road.",
    draft: {
      account: finalText,
      damageSchedule: [
        { vehicle: "own", part: "rear bumper", damage: "moderate dent", photoRefs: ["photo-1"] },
        { vehicle: "own", part: "left rear light", damage: "severe, broken", photoRefs: ["photo-1"] },
      ],
      missingItems: [{ item: "Police abstract", why: "Not yet obtained from the station." }],
      consistencyWarnings: [],
      questionsForUser: [],
      model: "demo-fixture",
      draftedAt,
    },
    finalText,
    confirmed: true,
    confirmedAt: draftedAt,
  });

  const result = await getIncident(incident.id);
  if (!result) throw new Error("Demo incident was not saved.");
  return result;
}
