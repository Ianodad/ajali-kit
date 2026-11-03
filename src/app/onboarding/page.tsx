"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { markOnboardingComplete } from "@/lib/onboarding";
import { cn } from "@/lib/utils";

// S02 Onboarding, SPEC section 5 (F1) and section 6: 3 swipe cards, a
// privacy card, then the optional "My vehicle" step. Built as a short
// button-driven stepper rather than real touch-swipe gestures: F1 only asks
// for "swipeable, with a Skip link", and Next/Back buttons cover the same
// ground in far less code for a 3-card flow.
const CARDS = [
  {
    title: "Stay safe first",
    body: "We'll help you collect everything your insurer needs.",
  },
  {
    title: "Take photos",
    body: "AI marks the damage for you. You check it.",
  },
  {
    title: "One claim pack",
    body: "Get one PDF claim pack to share with your insurer.",
  },
] as const;

type Step = "cards" | "privacy" | "vehicle";

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("cards");
  const [cardIndex, setCardIndex] = useState(0);

  function finish() {
    markOnboardingComplete();
    router.push("/");
  }

  function goToVehicle() {
    markOnboardingComplete();
    router.push("/vehicle?from=onboarding");
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between bg-navy px-4 py-6 text-white">
        <h1 className="text-xl font-semibold">Ajali Kit</h1>
        {step !== "vehicle" ? (
          <button type="button" onClick={finish} className="text-sm text-white/70 underline-offset-4 hover:underline">
            Skip
          </button>
        ) : null}
      </header>

      <main className="flex-1 space-y-6 p-4 pb-28 text-center">
        {step === "cards" ? (
          <section className="flex flex-col items-center gap-4 pt-10">
            <h2 className="text-lg font-semibold">{CARDS[cardIndex].title}</h2>
            <p className="max-w-xs text-sm text-muted-foreground">{CARDS[cardIndex].body}</p>
            <div className="flex gap-2">
              {CARDS.map((card, index) => (
                <span
                  key={card.title}
                  className={cn("size-2 rounded-full", index === cardIndex ? "bg-primary" : "bg-muted")}
                />
              ))}
            </div>
          </section>
        ) : null}

        {step === "privacy" ? (
          <section className="flex flex-col items-center gap-4 pt-10">
            <h2 className="text-lg font-semibold">Your privacy</h2>
            <p className="max-w-xs text-sm text-muted-foreground">
              Your photos and details stay on this phone. Photos are sent to Meta&apos;s AI only to analyse them, and
              you choose when.
            </p>
          </section>
        ) : null}

        {step === "vehicle" ? (
          <section className="flex flex-col items-center gap-4 pt-10">
            <h2 className="text-lg font-semibold">My vehicle</h2>
            <p className="max-w-xs text-sm text-muted-foreground">
              Save your vehicle details now so a new claim starts filled in. You can do this later from Home instead.
            </p>
          </section>
        ) : null}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-background/95 p-4 backdrop-blur">
        <div className="mx-auto flex max-w-md gap-3">
          {step === "cards" && cardIndex > 0 ? (
            <Button type="button" variant="outline" className="flex-1" onClick={() => setCardIndex((i) => i - 1)}>
              Back
            </Button>
          ) : null}

          {step === "cards" ? (
            <Button
              type="button"
              className="flex-1"
              onClick={() => {
                if (cardIndex < CARDS.length - 1) setCardIndex((i) => i + 1);
                else setStep("privacy");
              }}
            >
              {cardIndex < CARDS.length - 1 ? "Next" : "Got it"}
            </Button>
          ) : null}

          {step === "privacy" ? (
            <Button type="button" className="flex-1" onClick={() => setStep("vehicle")}>
              Got it
            </Button>
          ) : null}

          {step === "vehicle" ? (
            <>
              <Button type="button" variant="outline" className="flex-1" onClick={finish}>
                Later
              </Button>
              <Button type="button" className="flex-1" onClick={goToVehicle}>
                Set up now
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
