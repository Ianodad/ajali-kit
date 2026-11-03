// Real Muse Spark smoke test (SPEC 10.1, 10.3). Ian runs this with his own
// shell env, never pasted in chat: `npx tsx scripts/smoke-muse.ts <photo>`.
// Costs a little (SPEC 8.6). Never set AJALI_MOCK for this script; it is the
// one thing in this repo meant to hit the real API.
//
// Prints model, latency, token usage and the parsed damage items. Never
// prints the image bytes or the data URL (SPEC 11: no logging of image
// data).

import { readFile } from "node:fs/promises";
import { extname } from "node:path";

import OpenAI from "openai";

import {
  DAMAGE_ANALYSIS_JSON_SCHEMA,
  DAMAGE_ANALYSIS_USER_TEXT,
  DAMAGE_INSTRUCTIONS,
  DamageAnalysisWireSchema,
} from "../src/lib/schemas/damage-analysis";

const MIME_BY_EXTENSION: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

async function main(): Promise<void> {
  const photoPath = process.argv[2];
  if (!photoPath) {
    console.error("Usage: npx tsx scripts/smoke-muse.ts <path-to-photo>");
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
  const model = process.env.MUSE_MODEL ?? "muse-spark-1.3";

  const startedAt = Date.now();
  const res = await client.responses.create({
    model,
    instructions: DAMAGE_INSTRUCTIONS,
    input: [
      {
        type: "message",
        role: "user",
        content: [
          { type: "input_text", text: DAMAGE_ANALYSIS_USER_TEXT },
          { type: "input_image", image_url: imageDataUrl },
        ],
      },
    ],
    text: { format: { type: "json_schema", name: "damage_analysis", schema: DAMAGE_ANALYSIS_JSON_SCHEMA } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SPEC 10.3: cast when the SDK types lag the documented shape.
  } as any);
  const latencyMs = Date.now() - startedAt;

  console.log(`model: ${model}`);
  console.log(`latencyMs: ${latencyMs}`);
  console.log(`usage: ${JSON.stringify(res.usage)}`);

  const json = JSON.parse(res.output_text);
  const parsed = DamageAnalysisWireSchema.safeParse(json);
  if (!parsed.success) {
    console.error("Response did not match the damage_analysis schema:");
    console.error(parsed.error.message);
    console.error("Raw output_text:", res.output_text);
    process.exitCode = 1;
    return;
  }

  console.log(`isVehiclePhoto: ${parsed.data.is_vehicle_photo}`);
  console.log(`vehicleSide: ${parsed.data.vehicle_side}`);
  console.log(`qualityNote: ${parsed.data.quality_note || "(none)"}`);
  console.log(`items (${parsed.data.items.length}):`);
  for (const item of parsed.data.items) {
    console.log(`  - ${item.part}: ${item.damage_type}, ${item.severity}, box_2d=${JSON.stringify(item.box_2d)}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
