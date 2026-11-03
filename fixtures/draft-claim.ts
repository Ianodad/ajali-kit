import type { ClaimSummary, ClaimSummaryDamageItem } from "@/lib/claim-summary";
import type { ClaimDraftWire } from "@/lib/schemas/claim-draft";

// Mock fixture for /api/draft-claim (AJALI_MOCK=1 or x-ajali-mock: 1).
// Unlike the analyze-photo and extract-document fixtures (fixed sample
// data), this one is built from the summary the route actually received:
// SPEC F8's edge state ("the user's original text next to the draft, so
// they can compare") only makes sense in mock mode if the draft reads back
// the real location, time and confirmed damage, not a canned example from
// an unrelated incident.

function formatDate(occurredAt: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(occurredAt);
  return match ? match[1] : occurredAt;
}

function formatTime(occurredAt: string): string | null {
  const match = /T(\d{2}:\d{2})/.exec(occurredAt);
  return match ? match[1] : null;
}

function formatList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function groupDamageSchedule(items: ClaimSummaryDamageItem[]): ClaimDraftWire["damage_schedule"] {
  const byKey = new Map<string, { vehicle: "own" | "other"; part: string; damage: Set<string>; photoRefs: Set<string> }>();
  for (const item of items) {
    const key = `${item.vehicle}:${item.part}`;
    const group = byKey.get(key) ?? { vehicle: item.vehicle, part: item.part, damage: new Set(), photoRefs: new Set() };
    group.damage.add(`${item.damageType.replace(/_/g, " ")} (${item.severity})`);
    group.photoRefs.add(item.photoRef);
    byKey.set(key, group);
  }
  return Array.from(byKey.values()).map((group) => ({
    vehicle: group.vehicle,
    part: group.part,
    damage: Array.from(group.damage).join(", "),
    photo_refs: Array.from(group.photoRefs),
  }));
}

// Demo script / A8: "a front-damage photo and a 'hit from behind' account
// produces a consistency warning." Looks for the same kind of mismatch in
// either direction, from the damage parts and the user's own words only
// (never invents a contradiction that is not supported by the summary).
function detectConsistencyWarning(summary: ClaimSummary): ClaimDraftWire["consistency_warnings"][number] | null {
  const words = summary.userWords.toLowerCase();
  const saysHitFromBehind = /(hit|rear[- ]?ended|struck).*(from )?behind/.test(words) || /rear[- ]?end(ed)?/.test(words);
  const saysHeadOn = /head[- ]?on|hit.*front|front.*collision/.test(words);
  const hasFrontDamage = summary.damageItems.some((item) => /front/i.test(item.part));
  const hasRearDamage = summary.damageItems.some((item) => /rear|boot|tailgate/i.test(item.part));

  if (saysHitFromBehind && hasFrontDamage && !hasRearDamage) {
    return { warning: "You said you were hit from behind, but the damage found is on the front.", section: "account" };
  }
  if (saysHeadOn && hasRearDamage && !hasFrontDamage) {
    return { warning: "You said this was a head-on collision, but the damage found is at the rear.", section: "account" };
  }
  return null;
}

function buildMissingItems(summary: ClaimSummary): ClaimDraftWire["missing_items"] {
  const items: ClaimDraftWire["missing_items"] = [];
  if (!summary.obNumberKnown) {
    items.push({ item: "Police OB number", why: "Not recorded yet for this incident." });
  }
  if (!summary.abstractObtained) {
    items.push({ item: "Police abstract", why: "Not yet obtained from the station." });
  }
  if (summary.otherPartyInvolved === "yes" && summary.otherParties.some((party) => !party.insuranceOnFile)) {
    items.push({ item: "Other party's insurance details", why: "Not confirmed from the other driver yet." });
  }
  return items.slice(0, 3);
}

function buildQuestions(summary: ClaimSummary): string[] {
  const questions: string[] = [];
  if (summary.userWords.trim().split(/\s+/).filter(Boolean).length < 12) {
    questions.push("What direction was each vehicle travelling in?");
  }
  if (summary.otherPartyInvolved === "yes" && summary.otherParties.length === 0) {
    questions.push("Do you have the other driver's vehicle details yet?");
  }
  return questions.slice(0, 3);
}

export function buildClaimDraftFixture(summary: ClaimSummary): ClaimDraftWire {
  const date = formatDate(summary.occurredAt);
  const time = formatTime(summary.occurredAt);
  const place = summary.locationText.trim() || "the location described";
  const parts = Array.from(new Set(summary.damageItems.map((item) => item.part)));

  let account = time
    ? `On ${date} at ${time}, I was involved in a motor accident near ${place}.`
    : `On ${date}, I was involved in a motor accident near ${place}.`;
  if (summary.userWords.trim()) {
    account += ` ${summary.userWords.trim()}`;
  }
  if (parts.length > 0) {
    account += ` Damage was found on the ${formatList(parts)}.`;
  }

  const consistencyWarning = detectConsistencyWarning(summary);

  return {
    account,
    damage_schedule: groupDamageSchedule(summary.damageItems),
    missing_items: buildMissingItems(summary),
    consistency_warnings: consistencyWarning ? [consistencyWarning] : [],
    questions_for_user: buildQuestions(summary),
  };
}
