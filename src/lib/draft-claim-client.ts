import type { ApiResult } from "@/lib/ai/result";
import type { ClaimSummary } from "@/lib/claim-summary";
import type { ClaimDraft } from "@/lib/types";

// Client call for /api/draft-claim (SPEC F8 step 3, section 8.1's envelope).
// Mock mode is controlled server-side (AJALI_MOCK=1), same approach as
// extract-document-client.ts.
export async function draftClaim(summary: ClaimSummary): Promise<ClaimDraft> {
  let res: Response;
  try {
    res = await fetch("/api/draft-claim", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(summary),
    });
  } catch {
    throw new Error("Connect to the internet to draft your claim. Your own words are kept.");
  }
  const json = (await res.json().catch(() => null)) as ApiResult<ClaimDraft> | null;
  if (!json || json.ok !== true) {
    throw new Error(json?.ok === false ? json.error.message : "The claim draft failed. Your own words are kept.");
  }
  return json.data;
}
