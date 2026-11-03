"use client";

import { Button } from "@/components/ui/button";

const DEFAULT_MESSAGE =
  "We will send your damage photos to Meta's AI to mark the damage. They are not used to train Meta's models. Continue?";

// S10 AI consent sheet, SPEC F4 step 1 and SPEC 11 ("explicit AI consent per
// incident before photos or documents go to the Meta Model API"): shown the
// first time per incident, remembered after via Incident.aiConsent. One
// consent covers both damage photos and document scans (not a separate
// prompt per feature), so `message` lets each caller state what it is
// actually about to send (P4.R finding 2: the default text named only damage
// photos, which was wrong when shown before a document scan).
export function AiConsentSheet({
  message = DEFAULT_MESSAGE,
  onContinue,
  onNotNow,
}: {
  message?: string;
  onContinue: () => void;
  onNotNow: () => void;
}) {
  return (
    <div className="fixed inset-0 z-30 flex items-end bg-black/50" role="dialog" aria-modal>
      <div className="w-full rounded-t-2xl bg-background p-5 pb-8">
        <p className="text-sm">{message}</p>
        <div className="mt-4 flex gap-3">
          <Button type="button" variant="outline" className="flex-1" onClick={onNotNow}>
            Not now
          </Button>
          <Button type="button" className="flex-1" onClick={onContinue}>
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}
