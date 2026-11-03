// Real SAM 3.1 smoke test (SPEC 10.1, 10.4), concept-prompt mode: Ian runs
// `npx tsx scripts/smoke-sam.ts <photo> <concept>` (concept defaults to
// "car") with his own shell env, never pasted in chat. Costs a little (SPEC
// 8.6). Never set AJALI_MOCK for this script.
//
// Prints model, latency and a summary per decoded object (box, raster size,
// area, confidence). Never prints the image bytes, the data URL, or the raw
// mask payload (SPEC 11: no logging of image data).

import { readFile } from "node:fs/promises";
import { extname } from "node:path";

import { parseImageStream } from "@meta-sam/parser";
import OpenAI from "openai";

import { pairSamRecords } from "../src/lib/sam-parse";

const MIME_BY_EXTENSION: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

async function main(): Promise<void> {
  const photoPath = process.argv[2];
  const concept = process.argv[3] ?? "car";
  if (!photoPath) {
    console.error("Usage: npx tsx scripts/smoke-sam.ts <path-to-photo> [concept]");
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
          { type: "input_text", text: concept },
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
  console.log(`concept: ${concept}`);
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
