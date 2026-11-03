"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { BottomActionBar } from "@/components/bottom-action-bar";
import { Button } from "@/components/ui/button";
import { buildClaimSummary } from "@/lib/claim-summary";
import { draftClaim } from "@/lib/draft-claim-client";
import { getIncident, listPhotos, updateClaimAccount } from "@/lib/incidents";
import type { ClaimDraft, Incident, Photo } from "@/lib/types";
import { useFlushOnUnmount } from "@/lib/use-flush-on-unmount";
import { cn } from "@/lib/utils";

const AUTOSAVE_DELAY_MS = 600;

// SPEC F8 step 4's "Fix" jumps the user to the section a consistency warning
// points at. consistency_warnings uses "other_party" (the ClaimDraft wire
// shape); the hub route uses the hyphenated "other-party" slug.
const WARNING_SECTION_SLUG: Record<ClaimDraft["consistencyWarnings"][number]["section"], string> = {
  photos: "photos",
  account: "account",
  other_party: "other-party",
  police: "police",
  witnesses: "witnesses",
};

export default function AccountSectionPage() {
  const params = useParams<{ id: string }>();
  const [incident, setIncident] = useState<Incident | null | undefined>(undefined);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [dismissedWarnings, setDismissedWarnings] = useState<Set<number>>(new Set());
  const [showOriginalWords, setShowOriginalWords] = useState(false);

  useEffect(() => {
    getIncident(params.id).then((found) => setIncident(found ?? null));
    listPhotos(params.id).then(setPhotos);
  }, [params.id]);

  // Autosave the user's own words and the editable final text, same 600ms
  // debounce pattern as the other sections.
  useEffect(() => {
    if (!incident) return;
    const timeout = setTimeout(() => {
      void updateClaimAccount(incident.id, { userWords: incident.account.userWords, finalText: incident.account.finalText });
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [incident]);

  useFlushOnUnmount(incident, (current) => {
    if (!current) return;
    void updateClaimAccount(current.id, { userWords: current.account.userWords, finalText: current.account.finalText });
  });

  function setUserWords(userWords: string) {
    setIncident((prev) => (prev ? { ...prev, account: { ...prev.account, userWords } } : prev));
  }

  function setFinalText(finalText: string) {
    setIncident((prev) => (prev ? { ...prev, account: { ...prev.account, finalText } } : prev));
  }

  async function handleDraft() {
    if (!incident) return;
    setDrafting(true);
    setDraftError(null);
    setDismissedWarnings(new Set());
    try {
      const summary = buildClaimSummary(incident, photos);
      const draft = await draftClaim(summary);
      // First draft seeds the editable text; a redraft never overwrites an
      // edit the user has already made (Phase 5 brief: "Redraft keeps user
      // edits unless the user asks to replace them").
      const finalText = incident.account.finalText ?? draft.account;
      await updateClaimAccount(incident.id, { draft, finalText });
      setIncident((prev) => (prev ? { ...prev, account: { ...prev.account, draft, finalText } } : prev));
    } catch (error) {
      // Edge state: keep the user's own words as the account, so the PDF
      // can still be made even if the draft call fails.
      const finalText = incident.account.finalText ?? incident.account.userWords;
      setIncident((prev) => (prev ? { ...prev, account: { ...prev.account, finalText } } : prev));
      await updateClaimAccount(incident.id, { finalText });
      setDraftError(error instanceof Error ? error.message : "The claim draft failed. Your own words are kept.");
    } finally {
      setDrafting(false);
    }
  }

  async function handleUseAiText() {
    if (!incident?.account.draft) return;
    setFinalText(incident.account.draft.account);
    await updateClaimAccount(incident.id, { finalText: incident.account.draft.account });
  }

  async function handleConfirm(checked: boolean) {
    if (!incident) return;
    const confirmedAt = checked ? new Date().toISOString() : undefined;
    setIncident((prev) => (prev ? { ...prev, account: { ...prev.account, confirmed: checked, confirmedAt } } : prev));
    await updateClaimAccount(incident.id, { confirmed: checked, confirmedAt });
  }

  function dismissWarning(index: number) {
    setDismissedWarnings((prev) => new Set(prev).add(index));
  }

  if (incident === undefined) {
    return <p className="p-4 text-sm text-muted-foreground">Loading.</p>;
  }
  if (incident === null) {
    return <p className="p-4 text-sm text-muted-foreground">Incident not found.</p>;
  }

  const draft = incident.account.draft;
  const finalText = incident.account.finalText ?? "";
  const userWordsEmpty = incident.account.userWords.trim() === "";
  const visibleWarnings = (draft?.consistencyWarnings ?? []).filter((_, index) => !dismissedWarnings.has(index));

  return (
    <div className="flex flex-1 flex-col pb-24">
      <header className="bg-navy px-4 py-6 text-white">
        <Link href={`/incident/${incident.id}`} className="text-sm text-white/70 underline-offset-4 hover:underline">
          ‹ Back to incident
        </Link>
        <h1 className="mt-1 text-lg font-semibold">My account</h1>
      </header>

      <main className="flex-1 space-y-4 p-4">
        <div className="space-y-2">
          <label className="block text-sm font-medium" htmlFor="user-words">
            In your own words, what happened? Include direction, speed, lanes and who hit whom.
          </label>
          <textarea
            id="user-words"
            rows={5}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            value={incident.account.userWords}
            onChange={(e) => setUserWords(e.target.value)}
          />
          {userWordsEmpty ? <p className="text-xs text-muted-foreground">Write at least a sentence first.</p> : null}
        </div>

        <Button type="button" onClick={handleDraft} disabled={userWordsEmpty || drafting}>
          {drafting ? "Drafting." : draft ? "Redraft my claim with AI" : "Draft my claim with AI"}
        </Button>

        {draftError ? <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{draftError}</p> : null}

        {draft ? (
          <div className="space-y-4">
            <div className="space-y-2 rounded-lg border border-border bg-card p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Your claim account</p>
                <button type="button" className="text-xs text-primary underline-offset-4 hover:underline" onClick={() => setShowOriginalWords((v) => !v)}>
                  {showOriginalWords ? "Hide your words" : "Your words"}
                </button>
              </div>
              {showOriginalWords ? (
                <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">{incident.account.userWords}</p>
              ) : null}
              <textarea
                rows={6}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                value={finalText}
                onChange={(e) => setFinalText(e.target.value)}
              />
              {finalText !== draft.account ? (
                <Button type="button" variant="outline" size="sm" onClick={handleUseAiText}>
                  Use the AI draft text instead
                </Button>
              ) : null}
            </div>

            {visibleWarnings.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm font-medium">Check this</p>
                {(draft.consistencyWarnings ?? []).map((warning, index) =>
                  dismissedWarnings.has(index) ? null : (
                    <div key={index} className="space-y-2 rounded-lg border border-amber/40 bg-amber/10 p-3">
                      <p className="text-sm">{warning.warning}</p>
                      <div className="flex gap-2">
                        <Link href={`/incident/${incident.id}/${WARNING_SECTION_SLUG[warning.section]}`}>
                          <Button type="button" variant="outline" size="sm">
                            Fix
                          </Button>
                        </Link>
                        <Button type="button" variant="ghost" size="sm" onClick={() => dismissWarning(index)}>
                          Ignore
                        </Button>
                      </div>
                    </div>
                  ),
                )}
              </div>
            ) : null}

            {draft.questionsForUser.length > 0 ? (
              <div className="space-y-1 rounded-lg border border-border bg-card p-3">
                <p className="text-sm font-medium">A few things to add, if you can</p>
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {draft.questionsForUser.map((question, index) => (
                    <li key={index}>{question}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {draft.damageSchedule.length > 0 ? (
              <div className="space-y-1 rounded-lg border border-border bg-card p-3">
                <p className="text-sm font-medium">Damage schedule</p>
                <ul className="space-y-1 text-sm">
                  {draft.damageSchedule.map((item, index) => (
                    <li key={index}>
                      {item.vehicle === "own" ? "Your vehicle" : "Other vehicle"}: {item.part}, {item.damage}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {draft.missingItems.length > 0 ? (
              <div className="space-y-1 rounded-lg border border-border bg-card p-3">
                <p className="text-sm font-medium">The insurer will probably also ask for</p>
                <ul className="space-y-1 text-sm">
                  {draft.missingItems.map((item, index) => (
                    <li key={index}>
                      {item.item}: <span className="text-muted-foreground">{item.why}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <label className={cn("flex items-start gap-2 rounded-lg border border-border bg-card p-3 text-sm", !finalText && "opacity-50")}>
              <input
                type="checkbox"
                className="mt-0.5"
                checked={incident.account.confirmed}
                disabled={!finalText}
                onChange={(e) => handleConfirm(e.target.checked)}
              />
              I confirm this account is true to the best of my knowledge
            </label>
          </div>
        ) : null}
      </main>

      <BottomActionBar>
        <Link href={`/incident/${incident.id}`} className="w-full">
          <Button type="button" variant="outline" className="w-full">
            Back to incident
          </Button>
        </Link>
      </BottomActionBar>
    </div>
  );
}
