// Real SAM 3.1 smoke test (SPEC 10.1, 10.4): Ian runs this with his own
// shell env, never pasted in chat. Costs a little (SPEC 8.6). Never set
// AJALI_MOCK for this script.
//
//   npx tsx scripts/smoke-sam.ts <photo> [concept]
//     Concept-prompt mode (default concept "car").
//
//   npx tsx scripts/smoke-sam.ts <photo> box <width> <height> [left,top,right,bottom]
//     Box-prompt mode, via buildObjectPrompt, one object (PLAN.md Phase 3a:
//     "one SAM concept call, one SAM box call"). width/height must be the
//     photo's own pixel size (check with any image viewer or `file`/`sips`);
//     the box defaults to the centre 50% of the photo if not given.
//
// Prints model, latency and a summary per decoded object (box, raster size,
// area, confidence). Never prints the image bytes, the data URL, or the raw
// mask payload (SPEC 11: no logging of image data).

import { readFile } from "node:fs/promises";
import { extname } from "node:path";

import { buildObjectPrompt, parseImageStream } from "@meta-sam/parser";
import OpenAI from "openai";

import { pairSamRecords } from "../src/lib/sam-parse";

const MIME_BY_EXTENSION: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

function parseBoxArg(raw: string | undefined, width: number, height: number) {
  if (!raw) {
    // Default smoke box: the centre 50% of the photo.
    return { left: Math.round(width * 0.25), top: Math.round(height * 0.25), right: Math.round(width * 0.75), bottom: Math.round(height * 0.75) };
  }
  const parts = raw.split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    throw new Error(`Box must be "left,top,right,bottom", got "${raw}".`);
  }
  const [left, top, right, bottom] = parts;
  return { left, top, right, bottom };
}

function buildPromptText(mode: string, concept: string, box: ReturnType<typeof parseBoxArg>, width: number, height: number): string {
  if (mode === "box") {
    return buildObjectPrompt({ size: { width, height }, objects: [{ id: 1, prompts: [{ box }] }] });
  }
  return concept; // concept mode: a bare noun phrase, SPEC 10.4 "one concept per request".
}

async function main(): Promise<void> {
  const photoPath = process.argv[2];
  const modeOrConcept = process.argv[3];
  const isBoxMode = modeOrConcept === "box";

  if (!photoPath) {
    console.error("Usage: npx tsx scripts/smoke-sam.ts <path-to-photo> [concept | box <width> <height> [left,top,right,bottom]]");
    process.exitCode = 1;
    return;
  }

  const apiKey = process.env.MODEL_API_KEY;
  if (!apiKey) {
    console.error("MODEL_API_KEY is not set in your shell env.");
    process.exitCode = 1;
    return;
  }

  const mime = MIME_BY_EXTENSION[extname(photoPath).toLowerCase()];
  if (!mime) {
    console.error(`Unrecognised image extension for ${photoPath}. Expected .jpg, .jpeg, .png or .webp.`);
    process.exitCode = 1;
    return;
  }

  let promptText: string;
  let width = 0;
  let height = 0;
  const concept = isBoxMode ? "car" : modeOrConcept ?? "car";

  if (isBoxMode) {
    width = Number(process.argv[4]);
    height = Number(process.argv[5]);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      console.error("Box mode needs the photo's own pixel width and height: smoke-sam.ts <photo> box <width> <height> [box]");
      process.exitCode = 1;
      return;
    }
    try {
      const box = parseBoxArg(process.argv[6], width, height);
      promptText = buildPromptText("box", concept, box, width, height);
      console.log(`box: ${JSON.stringify(box)}`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
      return;
    }
  } else {
    promptText = concept;
  }

  const bytes = await readFile(photoPath);
  const imageDataUrl = `data:${mime};base64,${bytes.toString("base64")}`;

  const client = new OpenAI({
    baseURL: process.env.META_BASE_URL ?? "https://api.meta.ai/v1",
    apiKey,
  });
  const model = process.env.SAM_MODEL ?? "sam-3.1";

  const startedAt = Date.now();
  const events = await client.responses.create({
    model,
    input: [
      {
        type: "message",
        role: "user",
        content: [
          { type: "input_text", text: promptText },
          { type: "input_image", image_url: imageDataUrl },
        ],
      },
    ],
    stream: true,
    metadata: { mask_encoding: "one_bit", include_confidence: "true" },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SPEC 10.4: cast when the SDK types lag the documented shape.
  } as any);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the streamed Response type isn't the parser's generic event type, but is structurally compatible (SPEC 8.3).
  const parsed = parseImageStream(events as any);
  const result = await parsed.finalResult;
  const latencyMs = Date.now() - startedAt;

  console.log(`model: ${model}`);
  console.log(`mode: ${isBoxMode ? "box" : "concept"}`);
  console.log(`latencyMs: ${latencyMs}`);
  console.log(`outcome: ${JSON.stringify(result.outcome)}`);
  if (result.diagnostics.length > 0) {
    console.log(`diagnostics (${result.diagnostics.length}):`);
    for (const diagnostic of result.diagnostics) {
      console.log(`  - [${diagnostic.severity}] ${diagnostic.code}: ${diagnostic.message}`);
    }
  }

  const objects = pairSamRecords(result.records);
  console.log(`objects (${objects.length}):`);
  for (const object of objects) {
    console.log(
      `  - id=${object.objectId} box=${JSON.stringify(object.box)} raster=${object.rasterWidth}x${object.rasterHeight} areaPx=${object.areaPx} confidence=${object.confidence ?? "n/a"} svgPathLength=${object.svgPath.length}`,
    );
  }
  if (objects.length === 0) {
    console.log("  (no match: a valid outcome per SPEC 8.3, not an error)");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
