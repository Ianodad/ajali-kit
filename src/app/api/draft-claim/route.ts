import { APIError } from "openai";
import { NextResponse } from "next/server";

import { mapClaimDraft } from "@/lib/claim-draft-mapping";
import { apiError, apiOk, type ApiResult } from "@/lib/ai/result";
import { retryAfterMs, withRetries } from "@/lib/ai/retry";
import { getMetaClient, MUSE_MODEL } from "@/lib/meta";
import { isMockEnabled, mockDelay } from "@/lib/mock";
import {
  CLAIM_DRAFT_JSON_SCHEMA,
  ClaimDraftWireSchema,
  DraftClaimRequestSchema,
  DRAFT_CLAIM_INSTRUCTIONS,
  DRAFT_CLAIM_USER_TEXT,
  type DraftClaimRequest,
} from "@/lib/schemas/claim-draft";
import type { ClaimDraft } from "@/lib/types";
import { buildClaimDraftFixture } from "@fixtures/draft-claim";

export const maxDuration = 60;

class ParseFailure extends Error {}

function isRetryableApiError(error: unknown): boolean {
  if (error instanceof APIError) {
    const status = error.status;
    return status === 429 || (typeof status === "number" && status >= 500);
  }
  return error instanceof ParseFailure;
}

async function callMuseSpark(summary: DraftClaimRequest): Promise<ClaimDraft> {
  const client = getMetaClient();
  const startedAt = Date.now();

  return withRetries(
    async () => {
      const res = await client.responses.create({
        model: MUSE_MODEL,
        instructions: DRAFT_CLAIM_INSTRUCTIONS,
        input: [
          {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: `${DRAFT_CLAIM_USER_TEXT}\n\n${JSON.stringify(summary)}` }],
          },
        ],
        text: {
          format: { type: "json_schema", name: "claim_draft", schema: CLAIM_DRAFT_JSON_SCHEMA },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SPEC 10.3: cast when the SDK types lag the documented shape.
      } as any);

      let json: unknown;
      try {
        json = JSON.parse(res.output_text);
      } catch {
        throw new ParseFailure("Model response was not valid JSON");
      }
      const parsed = ClaimDraftWireSchema.safeParse(json);
      if (!parsed.success) {
        throw new ParseFailure(`Model response did not match the claim_draft schema: ${parsed.error.message}`);
      }

      console.log(
        JSON.stringify({
          route: "draft-claim",
          model: MUSE_MODEL,
          latencyMs: Date.now() - startedAt,
          usage: res.usage,
        }),
      );

      return mapClaimDraft(parsed.data, MUSE_MODEL, new Date().toISOString());
    },
    {
      isRetryable: isRetryableApiError,
      retryAfterMsFor: (error) => (error instanceof APIError ? retryAfterMs(error.headers) : null),
    },
  );
}

export async function POST(request: Request): Promise<NextResponse<ApiResult<ClaimDraft>>> {
  const body = await request.json().catch(() => null);
  const parsedRequest = DraftClaimRequestSchema.safeParse(body);
  if (!parsedRequest.success) {
    return NextResponse.json(apiError("invalid_request", "The request body did not match the expected shape.", false), {
      status: 400,
    });
  }
  const summary = parsedRequest.data;

  if (isMockEnabled(request.headers)) {
    await mockDelay();
    return NextResponse.json(apiOk(mapClaimDraft(buildClaimDraftFixture(summary), "mock", new Date().toISOString())));
  }

  try {
    const data = await callMuseSpark(summary);
    return NextResponse.json(apiOk(data));
  } catch (error) {
    if (error instanceof APIError) {
      console.error(JSON.stringify({ route: "draft-claim", errorCode: error.status ?? "unknown" }));
      if (error.status === 400) {
        return NextResponse.json(apiError("bad_request", error.message, false), { status: 400 });
      }
      const retryable = error.status === 429 || (typeof error.status === "number" && error.status >= 500);
      return NextResponse.json(apiError("model_error", error.message, retryable), { status: 502 });
    }
    console.error(JSON.stringify({ route: "draft-claim", errorCode: "unknown" }));
    return NextResponse.json(apiError("unknown_error", "The claim draft failed. Your own words are kept so the pack can still be built.", true), {
      status: 502,
    });
  }
}
