import { describe, expect, it } from "vitest";

import { DRAFT_CLAIM_INSTRUCTIONS } from "../claim-draft";

// CLAUDE.md: "No repair cost estimates and no fault decisions anywhere in
// the app or prompts." The prompt must say so explicitly, not just omit it,
// since the model would otherwise be free to guess at either.
describe("DRAFT_CLAIM_INSTRUCTIONS", () => {
  it("tells the model never to decide fault", () => {
    expect(DRAFT_CLAIM_INSTRUCTIONS.toLowerCase()).toMatch(/do not say who was at fault|never.*fault/);
  });

  it("tells the model never to estimate a repair cost", () => {
    expect(DRAFT_CLAIM_INSTRUCTIONS.toLowerCase()).toContain("never estimate a repair cost");
  });

  it("does not itself ask for a cost figure or a fault finding", () => {
    expect(DRAFT_CLAIM_INSTRUCTIONS.toLowerCase()).not.toMatch(/estimate the cost|who is at fault|who was to blame/);
  });
});
