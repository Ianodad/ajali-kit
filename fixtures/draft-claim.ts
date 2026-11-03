import type { ClaimSummary, ClaimSummaryDamageItem } from "@/lib/claim-summary";
import type { ClaimDraftWire } from "@/lib/schemas/claim-draft";

// Mock fixture for /api/draft-claim (AJALI_MOCK=1 or x-ajali-mock: 1).
// Unlike the analyze-photo and extract-document fixtures (fixed sample
// data), this one is built from the summary the route actually received:
// SPEC F8's edge state ("the user's original text next to the draft, so
// they can compare") only makes sense in mock mode if the draft reads back
// the real location, time and confirmed damage, not a canned example from
// an unrelated incident.

// occurredAtLocal is already local wall-clock "YYYY-MM-DDTHH:MM" (built by
// buildClaimSummary via lib/datetime.ts's toLocalInputValue), so a plain
// split is correct here; slicing the raw UTC ISO string the way this used
// to work showed the wrong hour outside UTC (browser-run bug a).
function formatDate(occurredAtLocal: string): string {
  return occurredAtLocal.slice(0, 10);
}

function formatTime(occurredAtLocal: string): string {
  return occurredAtLocal.slice(11, 16);
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
// produces a consistency warning." The account is the driver's own words
// about their own vehicle, so only the own-vehicle damage items are checked
// against it; the other party's damage says nothing about what happened to
// the driver's own car, in either direction (Codex review finding 6).
function detectConsistencyWarning(summary: ClaimSummary): ClaimDraftWire["consistency_warnings"][number] | null {
  const words = summary.userWords.toLowerCase();
  const saysHitFromBehind = /(hit|rear[- ]?ended|struck).*(from )?behind/.test(words) || /rear[- ]?end(ed)?/.test(words);
  const saysHeadOn = /head[- ]?on|hit.*front|front.*collision/.test(words);
  const ownDamageItems = summary.damageItems.filter((item) => item.vehicle === "own");
  const hasFrontDamage = ownDamageItems.some((item) => /front/i.test(item.part));
  const hasRearDamage = ownDamageItems.some((item) => /rear|boot|tailgate/i.test(item.part));

  if (saysHitFromBehind && hasFrontDamage && !hasRearDamage) {
    return { warning: "You said you were hit from behind, but the damage found is on the front.", section: "account" };
  }
  if (saysHeadOn && hasRearDamage && !hasFrontDamage) {
    return { warning: "You said this was a head-on collision, but the damage found is at the rear.", section: "account" };
  }
  return null;
}

// Codex review finding 7: an involved party with no record yet (not scanned
// or added) is itself missing detail, not a reason to skip the check; "yes"
// plus no party on file should surface the same gaps as "yes" plus an
// unconfirmed party.
function buildMissingItems(summary: ClaimSummary): ClaimDraftWire["missing_items"] {
  const items: ClaimDraftWire["missing_items"] = [];
  if (!summary.obNumberKnown) {
    items.push({ item: "Police OB number", why: "Not recorded yet for this incident." });
  }
  if (!summary.abstractObtained) {
    items.push({ item: "Police abstract", why: "Not yet obtained from the station." });
  }
  if (summary.otherPartyInvolved === "yes") {
    const noPartyOnFile = summary.otherParties.length === 0;
    if (noPartyOnFile || summary.otherParties.some((party) => !party.insuranceOnFile)) {
      items.push({ item: "Other party's insurance details", why: "Not confirmed from the other driver yet." });
    }
    if (noPartyOnFile || summary.otherParties.some((party) => !party.licenceOnFile)) {
      items.push({ item: "Other driver's licence copy", why: "Not scanned yet." });
    }
    if (noPartyOnFile || summary.otherParties.some((party) => !party.logbookOnFile)) {
      items.push({ item: "Other vehicle's logbook copy", why: "Not scanned yet." });
    }
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
  const date = formatDate(summary.occurredAtLocal);
  const time = formatTime(summary.occurredAtLocal);
  const place = summary.locationText.trim() || "the location described";
  const parts = Array.from(new Set(summary.damageItems.map((item) => item.part)));

  let account = `On ${date} at ${time}, I was involved in a motor accident near ${place}.`;
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
