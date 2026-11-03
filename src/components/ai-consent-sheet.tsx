"use client";

import { Button } from "@/components/ui/button";

// S10 AI consent sheet, SPEC F4 step 1: shown the first time per incident,
// remembered after via Incident.aiConsent.
export function AiConsentSheet({
  onContinue,
  onNotNow,
}: {
  onContinue: () => void;
  onNotNow: () => void;
}) {
  return (
    <div className="fixed inset-0 z-30 flex items-end bg-black/50" role="dialog" aria-modal>
      <div className="w-full rounded-t-2xl bg-background p-5 pb-8">
        <p className="text-sm">
          We will send your damage photos to Meta&apos;s AI to mark the damage. They are not used to train
          Meta&apos;s models. Continue?
        </p>
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
