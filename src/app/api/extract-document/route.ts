import { APIError } from "openai";
import { NextResponse } from "next/server";

import { apiError, apiOk, type ApiResult } from "@/lib/ai/result";
import { retryAfterMs, withRetries } from "@/lib/ai/retry";
import { type ExtractDocumentData, mapDocumentExtract } from "@/lib/extract-document-mapping";
import { getMetaClient, MUSE_MODEL } from "@/lib/meta";
import { isMockEnabled, mockDelay } from "@/lib/mock";
import {
  buildDocumentInstructions,
  DOCUMENT_EXTRACT_JSON_SCHEMA,
  DOCUMENT_EXTRACT_USER_TEXT,
  DocumentExtractWireSchema,
  ExtractDocumentRequestSchema,
} from "@/lib/schemas/document-extract";
import { getExtractDocumentFixture } from "@fixtures/extract-document";

export const maxDuration = 60;

class ParseFailure extends Error {}

function isRetryableApiError(error: unknown): boolean {
  if (error instanceof APIError) {
    const status = error.status;
    return status === 429 || (typeof status === "number" && status >= 500);
  }
  return error instanceof ParseFailure;
}

async function callMuseSpark(imageDataUrl: string, docType: Parameters<typeof buildDocumentInstructions>[0]): Promise<ExtractDocumentData> {
  const client = getMetaClient();
  const startedAt = Date.now();

  return withRetries(
    async () => {
      const res = await client.responses.create({
        model: MUSE_MODEL,
        instructions: buildDocumentInstructions(docType),
        input: [
          {
            type: "message",
            role: "user",
            content: [
              { type: "input_text", text: DOCUMENT_EXTRACT_USER_TEXT },
              { type: "input_image", image_url: imageDataUrl },
            ],
          },
        ],
        text: {
          format: { type: "json_schema", name: "document_extract", schema: DOCUMENT_EXTRACT_JSON_SCHEMA },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SPEC 10.3: cast when the SDK types lag the documented shape.
      } as any);

      let json: unknown;
      try {
        json = JSON.parse(res.output_text);
      } catch {
        throw new ParseFailure("Model response was not valid JSON");
      }
      const parsed = DocumentExtractWireSchema.safeParse(json);
      if (!parsed.success) {
        throw new ParseFailure(`Model response did not match the document_extract schema: ${parsed.error.message}`);
      }

      console.log(
        JSON.stringify({
          route: "extract-document",
          model: MUSE_MODEL,
          latencyMs: Date.now() - startedAt,
          usage: res.usage,
        }),
      );

      return mapDocumentExtract(parsed.data, MUSE_MODEL);
    },
    {
      isRetryable: isRetryableApiError,
      retryAfterMsFor: (error) => (error instanceof APIError ? retryAfterMs(error.headers) : null),
    },
  );
}

export async function POST(request: Request): Promise<NextResponse<ApiResult<ExtractDocumentData>>> {
  const body = await request.json().catch(() => null);
  const parsedRequest = ExtractDocumentRequestSchema.safeParse(body);
  if (!parsedRequest.success) {
    return NextResponse.json(apiError("invalid_request", "The request body did not match the expected shape.", false), {
      status: 400,
    });
  }
  const { imageDataUrl, docType } = parsedRequest.data;

  if (isMockEnabled(request.headers)) {
    await mockDelay();
    return NextResponse.json(apiOk(mapDocumentExtract(getExtractDocumentFixture(docType), "mock")));
  }

  try {
    const data = await callMuseSpark(imageDataUrl, docType);
    return NextResponse.json(apiOk(data));
  } catch (error) {
    if (error instanceof APIError) {
      console.error(JSON.stringify({ route: "extract-document", errorCode: error.status ?? "unknown" }));
      if (error.status === 400) {
        return NextResponse.json(apiError("bad_request", error.message, false), { status: 400 });
      }
      const retryable = error.status === 429 || (typeof error.status === "number" && error.status >= 500);
      return NextResponse.json(apiError("model_error", error.message, retryable), { status: 502 });
    }
    console.error(JSON.stringify({ route: "extract-document", errorCode: "unknown" }));
    return NextResponse.json(apiError("unknown_error", "We couldn't read this document. Try again.", true), { status: 502 });
  }
}
