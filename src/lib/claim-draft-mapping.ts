import type { ClaimDraftWire } from "@/lib/schemas/claim-draft";
import type { ClaimDraft } from "@/lib/types";

// Shared post-processing for /api/draft-claim, used by both the mock and the
// real branch (same approach as analyze-photo-mapping.ts and
// extract-document-mapping.ts): snake_case wire shape in, camelCase
// ClaimDraft out, with the model name and a drafted-at timestamp stamped on.
export function mapClaimDraft(wire: ClaimDraftWire, model: string, draftedAt: string): ClaimDraft {
  return {
    account: wire.account,
    damageSchedule: wire.damage_schedule.map((item) => ({
      vehicle: item.vehicle,
      part: item.part,
      damage: item.damage,
      photoRefs: item.photo_refs,
    })),
    missingItems: wire.missing_items.map((item) => ({ item: item.item, why: item.why })),
    consistencyWarnings: wire.consistency_warnings.map((warning) => ({ warning: warning.warning, section: warning.section })),
    questionsForUser: wire.questions_for_user,
    model,
    draftedAt,
  };
}
