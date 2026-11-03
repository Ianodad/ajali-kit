import { APIError } from "openai";
import { NextResponse } from "next/server";

import { mapDamageAnalysis, type AnalyzePhotoData } from "@/lib/analyze-photo-mapping";
import { apiError, apiOk, type ApiResult } from "@/lib/ai/result";
import { retryAfterMs, withRetries } from "@/lib/ai/retry";
import { getMetaClient, MUSE_MODEL } from "@/lib/meta";
import { isMockEnabled, mockDelay } from "@/lib/mock";
import {
  AnalyzePhotoRequestSchema,
  DAMAGE_ANALYSIS_JSON_SCHEMA,
  DAMAGE_ANALYSIS_USER_TEXT,
  DAMAGE_INSTRUCTIONS,
  DamageAnalysisWireSchema,
} from "@/lib/schemas/damage-analysis";
import { ANALYZE_PHOTO_FIXTURE } from "@fixtures/analyze-photo";

export const maxDuration = 60;

class ParseFailure extends Error {}

function isRetryableApiError(error: unknown): boolean {
  if (error instanceof APIError) {
    const status = error.status;
    return status === 429 || (typeof status === "number" && status >= 500);
  }
  // JSON.parse or zod validation failures on the real path: SPEC 8.1 asks
  // for retries on parse failure, not just on HTTP status.
  return error instanceof ParseFailure;
}

async function callMuseSpark(imageDataUrl: string, width: number, height: number): Promise<AnalyzePhotoData> {
  const client = getMetaClient();
  const startedAt = Date.now();

  const result = await withRetries(
    async () => {
      const res = await client.responses.create({
        model: MUSE_MODEL,
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
        text: {
          format: { type: "json_schema", name: "damage_analysis", schema: DAMAGE_ANALYSIS_JSON_SCHEMA },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SPEC 10.3: cast when the SDK types lag the documented shape.
      } as any);

      let json: unknown;
      try {
        json = JSON.parse(res.output_text);
      } catch {
        throw new ParseFailure("Model response was not valid JSON");
      }
      const parsed = DamageAnalysisWireSchema.safeParse(json);
      if (!parsed.success) {
        throw new ParseFailure(`Model response did not match the damage_analysis schema: ${parsed.error.message}`);
      }

      console.log(
        JSON.stringify({
          route: "analyze-photo",
          model: MUSE_MODEL,
          latencyMs: Date.now() - startedAt,
          usage: res.usage,
        }),
      );

      return mapDamageAnalysis(parsed.data, width, height, MUSE_MODEL);
    },
    {
      isRetryable: isRetryableApiError,
      retryAfterMsFor: (error) => (error instanceof APIError ? retryAfterMs(error.headers) : null),
    },
  );

  return result;
}

export async function POST(request: Request): Promise<NextResponse<ApiResult<AnalyzePhotoData>>> {
  const body = await request.json().catch(() => null);
  const parsedRequest = AnalyzePhotoRequestSchema.safeParse(body);
  if (!parsedRequest.success) {
    return NextResponse.json(apiError("invalid_request", "The request body did not match the expected shape.", false), {
      status: 400,
    });
  }
  const { imageDataUrl, width, height } = parsedRequest.data;

  if (isMockEnabled(request.headers)) {
    await mockDelay();
    return NextResponse.json(apiOk(mapDamageAnalysis(ANALYZE_PHOTO_FIXTURE, width, height, "mock")));
  }

  try {
    const data = await callMuseSpark(imageDataUrl, width, height);
    return NextResponse.json(apiOk(data));
  } catch (error) {
    if (error instanceof APIError) {
      console.error(JSON.stringify({ route: "analyze-photo", errorCode: error.status ?? "unknown" }));
      if (error.status === 400) {
        return NextResponse.json(apiError("bad_request", error.message, false), { status: 400 });
      }
      const retryable = error.status === 429 || (typeof error.status === "number" && error.status >= 500);
      return NextResponse.json(apiError("model_error", error.message, retryable), { status: 502 });
    }
    console.error(JSON.stringify({ route: "analyze-photo", errorCode: "unknown" }));
    return NextResponse.json(apiError("unknown_error", "The damage check failed. Try again.", true), { status: 502 });
  }
}
