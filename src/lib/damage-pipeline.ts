import { blobToDataUrl } from "@/lib/blob-data-url";
import type { PixelBox } from "@/lib/box-convert";
import { mapWithConcurrency } from "@/lib/concurrency";
import { getBlob } from "@/lib/incidents";
import type { ApiResult } from "@/lib/ai/result";
import type { AnalyzePhotoData } from "@/lib/analyze-photo-mapping";
import type { SegmentResponseData, SegmentResponseObject } from "@/lib/segment-response";
import type { DamageAnalysis, DamageItem, Photo } from "@/lib/types";

// Client orchestration for the AI damage check (SPEC F4, section 8.1
// diagram, 10.6): per photo, analyze then run the vehicle mask and box masks
// in parallel; across photos, at most 3 in flight at once.

export const DAMAGE_PHOTO_CONCURRENCY = 3; // SPEC 10.6

export type DamagePhotoProgress = "finding_damage" | "marking_area" | "done" | "error";

export interface RunDamagePipelineOptions {
  onProgress?: (photoId: string, progress: DamagePhotoProgress) => void;
  headers?: Record<string, string>; // e.g. { "x-ajali-mock": "1" } for dev/testing
}

async function postJson<T>(path: string, body: unknown, headers: Record<string, string> = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Connect to the internet to use the AI check. Your photos are saved.");
  }
  const json = (await res.json().catch(() => null)) as ApiResult<T> | null;
  if (!json || json.ok !== true) {
    throw new Error(json?.ok === false ? json.error.message : "The AI check failed. Try again.");
  }
  return json.data;
}

function intersectionArea(a: PixelBox, b: PixelBox): number {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.right, b.right);
  const bottom = Math.min(a.bottom, b.bottom);
  return Math.max(0, right - left) * Math.max(0, bottom - top);
}

// SPEC F4 step 4: "The app keeps the largest vehicle mask that overlaps most
// of the damage boxes as 'this vehicle'."
function pickVehicleMask(
  vehicleObjects: SegmentResponseObject[],
  damageBoxes: PixelBox[],
): SegmentResponseObject | undefined {
  if (vehicleObjects.length === 0) return undefined;
  if (vehicleObjects.length === 1 || damageBoxes.length === 0) return vehicleObjects[0];
  let best = vehicleObjects[0];
  let bestOverlap = -1;
  for (const candidate of vehicleObjects) {
    const overlap = damageBoxes.reduce((sum, box) => sum + intersectionArea(candidate.box, box), 0);
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      best = candidate;
    }
  }
  return best;
}

// Analyzes one damage photo end to end and returns the DamageAnalysis to
// store on it. Throws on a real failure (network, API error after retries,
// a response that doesn't parse); a degraded-but-valid outcome (no damage
// found, not a vehicle, no vehicle mask, a box with no matching mask) is
// returned as data, per SPEC F4's edge states, not thrown.
export async function analyzeDamagePhoto(
  photo: Photo,
  options: RunDamagePipelineOptions = {},
): Promise<DamageAnalysis> {
  const { onProgress, headers } = options;
  onProgress?.(photo.id, "finding_damage");

  const blobRecord = await getBlob(photo.blobId);
  if (!blobRecord) throw new Error("That photo's data is missing from this device.");
  const imageDataUrl = await blobToDataUrl(blobRecord.blob);

  const analysis = await postJson<AnalyzePhotoData>(
    "/api/analyze-photo",
    { imageDataUrl, width: photo.width, height: photo.height },
    headers,
  );

  const analysedAt = new Date().toISOString();

  if (!analysis.isVehiclePhoto || analysis.items.length === 0) {
    onProgress?.(photo.id, "done");
    return {
      model: analysis.model,
      analysedAt,
      isVehiclePhoto: analysis.isVehiclePhoto,
      vehicleSide: analysis.vehicleSide,
      qualityNote: analysis.qualityNote || undefined,
      items: [],
    };
  }

  onProgress?.(photo.id, "marking_area");

  const samItems = analysis.items.map((item, index) => ({ samObjectId: index + 1, item }));
  const damageBoxes = samItems.map(({ item }) => item.boxPx);

  const errors: string[] = [];
  const [vehicleResult, boxesData] = await Promise.all([
    postJson<SegmentResponseData>(
      "/api/segment",
      { mode: "concept", concept: "car", imageDataUrl, width: photo.width, height: photo.height },
      headers,
    ).catch((error: unknown): SegmentResponseData => {
      // SPEC F4 edge state: "SAM finds no car: hide the percentage; still show damage masks."
      errors.push(error instanceof Error ? error.message : "Could not find the vehicle outline.");
      return { objects: [] };
    }),
    postJson<SegmentResponseData>(
      "/api/segment",
      {
        mode: "boxes",
        imageDataUrl,
        width: photo.width,
        height: photo.height,
        items: samItems.map(({ samObjectId, item }) => ({ id: samObjectId, box: item.boxPx })),
      },
      headers,
    ),
  ]);

  if (vehicleResult.errors?.length) errors.push(...vehicleResult.errors);
  if (boxesData.errors?.length) errors.push(...boxesData.errors);

  const vehicleMaskObject = pickVehicleMask(vehicleResult.objects, damageBoxes);
  const vehicleMask = vehicleMaskObject
    ? { svgPath: vehicleMaskObject.svgPath, boxPx: vehicleMaskObject.box, areaPx: vehicleMaskObject.areaPx }
    : undefined;

  const maskByObjectId = new Map(boxesData.objects.map((object) => [object.objectId, object]));

  const items: DamageItem[] = samItems.map(({ samObjectId, item }) => {
    // SPEC F4 edge state: "SAM returns zero matches for a box: keep the item
    // with the box outline only, mark 'Mask not available'" (the UI reads
    // that from a missing maskSvgPath).
    const mask = maskByObjectId.get(String(samObjectId));
    return {
      id: crypto.randomUUID(),
      samObjectId,
      part: item.part,
      damageType: item.damageType,
      severity: item.severity,
      description: item.description,
      boxNorm: item.boxNorm,
      boxPx: item.boxPx,
      maskSvgPath: mask?.svgPath,
      maskBoxPx: mask?.box,
      maskAreaPx: mask?.areaPx,
      shareOfVehicle: mask && vehicleMask && vehicleMask.areaPx > 0 ? mask.areaPx / vehicleMask.areaPx : undefined,
      source: "ai",
      status: "pending",
    };
  });

  onProgress?.(photo.id, "done");

  return {
    model: analysis.model,
    analysedAt,
    isVehiclePhoto: true,
    vehicleSide: analysis.vehicleSide,
    qualityNote: analysis.qualityNote || undefined,
    vehicleMask,
    items,
    errors: errors.length > 0 ? errors : undefined,
  };
}

export interface DamagePipelinePhotoResult {
  photoId: string;
  analysis?: DamageAnalysis;
  error?: string;
}

// Runs analyzeDamagePhoto over several photos, at most DAMAGE_PHOTO_CONCURRENCY
// at a time (SPEC 10.6). A single photo's failure does not stop the others.
export async function runDamagePipeline(
  photos: readonly Photo[],
  options: RunDamagePipelineOptions = {},
): Promise<DamagePipelinePhotoResult[]> {
  return mapWithConcurrency(photos, DAMAGE_PHOTO_CONCURRENCY, async (photo) => {
    try {
      const analysis = await analyzeDamagePhoto(photo, options);
      return { photoId: photo.id, analysis };
    } catch (error) {
      options.onProgress?.(photo.id, "error");
      return { photoId: photo.id, error: error instanceof Error ? error.message : "The AI check failed." };
    }
  });
}
