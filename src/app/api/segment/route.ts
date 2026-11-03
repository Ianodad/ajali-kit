import { buildObjectPrompt, ObjectPromptError, parseImageStream } from "@meta-sam/parser";
import { APIError } from "openai";
import { NextResponse } from "next/server";

import { apiError, apiOk, type ApiResult } from "@/lib/ai/result";
import { retryAfterMs, withRetries } from "@/lib/ai/retry";
import { getMetaClient, SAM_MODEL } from "@/lib/meta";
import { buildMockBoxMasks, buildMockVehicleMask } from "@/lib/mock/segment-mock";
import { isMockEnabled, mockDelay } from "@/lib/mock";
import { pairSamRecords } from "@/lib/sam-parse";
import { SegmentRequestSchema, type SegmentRequest } from "@/lib/schemas/segment";
import type { SegmentResponseData } from "@/lib/segment-response";

export const maxDuration = 60;

function isRetryableApiError(error: unknown): boolean {
  if (!(error instanceof APIError)) return false;
  const status = error.status;
  return status === 429 || (typeof status === "number" && status >= 500);
}

function buildPromptText(request: SegmentRequest): string {
  if (request.mode === "concept") return request.concept;
  return buildObjectPrompt({
    size: { width: request.width, height: request.height },
    objects: request.items.map((item) => ({ id: item.id, prompts: [{ box: item.box }] })),
  });
}

async function callSam(request: SegmentRequest, promptText: string): Promise<SegmentResponseData> {
  const client = getMetaClient();
  const startedAt = Date.now();

  return withRetries(
    async () => {
      const events = await client.responses.create({
        model: SAM_MODEL,
        input: [
          {
            type: "message",
            role: "user",
            content: [
              { type: "input_text", text: promptText },
              { type: "input_image", image_url: request.imageDataUrl },
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

      console.log(
        JSON.stringify({
          route: "segment",
          mode: request.mode,
          model: SAM_MODEL,
          latencyMs: Date.now() - startedAt,
        }),
      );

      const objects = pairSamRecords(result.records);
      const errors: string[] = [];
      if (result.outcome.status === "incomplete") {
        errors.push(`The response was incomplete (${result.outcome.reason}). Showing what was parsed.`);
      }
      for (const diagnostic of result.diagnostics) {
        if (diagnostic.severity === "error") errors.push(diagnostic.message);
      }
      // SPEC 8.3: zero records with a completed outcome is a valid "no match", not an error.
      return errors.length > 0 ? { objects, errors } : { objects };
    },
    {
      isRetryable: isRetryableApiError,
      retryAfterMsFor: (error) => (error instanceof APIError ? retryAfterMs(error.headers) : null),
    },
  );
}

export async function POST(request: Request): Promise<NextResponse<ApiResult<SegmentResponseData>>> {
  const body = await request.json().catch(() => null);
  const parsedRequest = SegmentRequestSchema.safeParse(body);
  if (!parsedRequest.success) {
    return NextResponse.json(apiError("invalid_request", "The request body did not match the expected shape.", false), {
      status: 400,
    });
  }
  const segmentRequest = parsedRequest.data;

  if (isMockEnabled(request.headers)) {
    await mockDelay();
    const objects =
      segmentRequest.mode === "concept"
        ? [buildMockVehicleMask(segmentRequest.width, segmentRequest.height)]
        : buildMockBoxMasks(segmentRequest.items);
    return NextResponse.json(apiOk({ objects }));
  }

  let promptText: string;
  try {
    promptText = buildPromptText(segmentRequest);
  } catch (error) {
    if (error instanceof ObjectPromptError) {
      return NextResponse.json(apiError("invalid_box", error.message, false), { status: 400 });
    }
    throw error;
  }

  try {
    const data = await callSam(segmentRequest, promptText);
    return NextResponse.json(apiOk(data));
  } catch (error) {
    if (error instanceof APIError) {
      console.error(JSON.stringify({ route: "segment", errorCode: error.status ?? "unknown" }));
      if (error.status === 400) {
        return NextResponse.json(apiError("bad_request", error.message, false), { status: 400 });
      }
      const retryable = error.status === 429 || (typeof error.status === "number" && error.status >= 500);
      return NextResponse.json(apiError("model_error", error.message, retryable), { status: 502 });
    }
    console.error(JSON.stringify({ route: "segment", errorCode: "unknown" }));
    return NextResponse.json(apiError("unknown_error", "The segmentation step failed. Try again.", true), { status: 502 });
  }
}
