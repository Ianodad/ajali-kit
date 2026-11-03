"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

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
  const [questionAnswers, setQuestionAnswers] = useState<Record<number, string>>({});

  // Read after an awaited draftClaim() call, so a redraft resolves against
  // whatever the user actually has on screen when the response lands, not
  // the incident captured when the request started (Codex review finding 2).
  const incidentRef = useRef(incident);
  useEffect(() => {
    incidentRef.current = incident;
  }, [incident]);

  useEffect(() => {
    getIncident(params.id)
      .then((found) => setIncident(found ?? null))
      .catch(() => setIncident(null));
    listPhotos(params.id).then(setPhotos);
  }, [params.id]);

  // Autosave the user's own words, the editable final text and the
  // declaration, same 600ms debounce pattern as the other sections.
  useEffect(() => {
    if (!incident) return;
    const timeout = setTimeout(() => {
      void updateClaimAccount(incident.id, {
        userWords: incident.account.userWords,
        finalText: incident.account.finalText,
        confirmed: incident.account.confirmed,
        confirmedAt: incident.account.confirmedAt,
      });
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [incident]);

  useFlushOnUnmount(incident, (current) => {
    if (!current) return;
    void updateClaimAccount(current.id, {
      userWords: current.account.userWords,
      finalText: current.account.finalText,
      confirmed: current.account.confirmed,
      confirmedAt: current.account.confirmedAt,
    });
  });

  function setUserWords(userWords: string) {
    setIncident((prev) => (prev ? { ...prev, account: { ...prev.account, userWords } } : prev));
  }

  // Editing the account after confirming it, or swapping in the AI text,
  // means the declaration no longer covers what's on screen, so it must be
  // re-done (Codex review finding 4).
  function setFinalText(nextFinalText: string) {
    setIncident((prev) => {
      if (!prev || nextFinalText === prev.account.finalText) return prev;
      return { ...prev, account: { ...prev.account, finalText: nextFinalText, confirmed: false, confirmedAt: undefined } };
    });
  }

  async function handleDraft() {
    if (!incident) return;
    const incidentId = incident.id;
    const pendingAnswers = Object.values(questionAnswers)
      .map((answer) => answer.trim())
      .filter(Boolean);
    setDrafting(true);
    setDraftError(null);
    setDismissedWarnings(new Set());
    try {
      const base = incidentRef.current ?? incident;
      // SPEC F8 step 4: "Questions can be answered inline and the user can
      // tap Redraft." The answers become part of the user's own words, so
      // the model only ever sees facts the driver actually provided (Codex
      // review finding 5).
      const mergedWords =
        pendingAnswers.length > 0 ? [base.account.userWords.trim(), ...pendingAnswers].filter(Boolean).join(" ") : base.account.userWords;
      if (mergedWords !== base.account.userWords) {
        setUserWords(mergedWords);
        await updateClaimAccount(incidentId, { userWords: mergedWords });
        setQuestionAnswers({});
      }

      const summary = buildClaimSummary({ ...base, account: { ...base.account, userWords: mergedWords } }, photos);
      const draft = await draftClaim(summary);

      const latest = incidentRef.current ?? base;
      // First draft seeds the editable text; a redraft never overwrites an
      // edit the user has already made (Phase 5 brief: "Redraft keeps user
      // edits unless the user asks to replace them"), resolved against the
      // state at the time the response lands, not when the request started.
      const finalText = latest.account.finalText ?? draft.account;
      await updateClaimAccount(incidentId, { draft, finalText });
      setIncident((prev) => (prev && prev.id === incidentId ? { ...prev, account: { ...prev.account, draft, finalText } } : prev));
    } catch (error) {
      // Edge state: keep the latest own words (or an already-edited final
      // text) as the account, so the PDF can still be made even if the
      // draft call fails.
      const latest = incidentRef.current ?? incident;
      const finalText = latest.account.finalText ?? latest.account.userWords;
      await updateClaimAccount(incidentId, { finalText });
      setIncident((prev) => (prev && prev.id === incidentId ? { ...prev, account: { ...prev.account, finalText } } : prev));
      setDraftError(error instanceof Error ? error.message : "The claim draft failed. Your own words are kept.");
    } finally {
      setDrafting(false);
    }
  }

  async function handleUseAiText() {
    if (!incident?.account.draft) return;
    const finalText = incident.account.draft.account;
    setFinalText(finalText);
    await updateClaimAccount(incident.id, { finalText, confirmed: false, confirmedAt: undefined });
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
  // The failed-draft fallback sets finalText with no draft object (edge
  // state: "keep the user's own words as the account"), so the review box
  // and declaration must still render then, not only once a draft exists
  // (Codex review finding 3; this is A8's failure path).
  const hasReviewableAccount = Boolean(draft) || finalText.trim() !== "";
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

        {hasReviewableAccount ? (
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
              {draft && finalText !== draft.account ? (
                <Button type="button" variant="outline" size="sm" onClick={handleUseAiText}>
                  Use the AI draft text instead
                </Button>
              ) : null}
            </div>

            {draft ? (
              <>
                {visibleWarnings.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Check this</p>
                    {draft.consistencyWarnings.map((warning, index) =>
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
                  <div className="space-y-2 rounded-lg border border-border bg-card p-3">
                    <p className="text-sm font-medium">A few things to add, if you can</p>
                    <p className="text-xs text-muted-foreground">Answer here, then tap Redraft to add it to your account.</p>
                    <ul className="space-y-2">
                      {draft.questionsForUser.map((question, index) => (
                        <li key={index} className="space-y-1">
                          <p className="text-sm">{question}</p>
                          <input
                            type="text"
                            className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
                            value={questionAnswers[index] ?? ""}
                            onChange={(e) => setQuestionAnswers((prev) => ({ ...prev, [index]: e.target.value }))}
                          />
                        </li>
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
              </>
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
