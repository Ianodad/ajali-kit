import type { ApiResult } from "@/lib/ai/result";
import type { ExtractDocumentData } from "@/lib/extract-document-mapping";
import type { DocType } from "@/lib/types";

// Client call for /api/extract-document (SPEC F5 step 3, section 8.1's
// envelope). Mock mode is controlled server-side (AJALI_MOCK=1), so no header
// is needed here, the same approach damage-pipeline.ts uses for the other AI
// routes.
export async function extractDocument(imageDataUrl: string, docType: DocType): Promise<ExtractDocumentData> {
  let res: Response;
  try {
    res = await fetch("/api/extract-document", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ imageDataUrl, docType }),
    });
  } catch {
    throw new Error("Connect to the internet to scan a document. Your photo is saved.");
  }
  const json = (await res.json().catch(() => null)) as ApiResult<ExtractDocumentData> | null;
  if (!json || json.ok !== true) {
    throw new Error(json?.ok === false ? json.error.message : "We couldn't read this document. Try again.");
  }
  return json.data;
}
