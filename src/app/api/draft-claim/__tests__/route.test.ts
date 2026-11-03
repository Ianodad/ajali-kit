import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ClaimSummary } from "@/lib/claim-summary";

// route.ts imports "@/lib/meta", a server-only module; replace it wholesale,
// the same approach the other AI routes' tests use.
const createMock = vi.fn();
vi.mock("@/lib/meta", () => ({
  getMetaClient: () => ({ responses: { create: createMock } }),
  MUSE_MODEL: "muse-spark-1.3",
}));

const { POST } = await import("../route");

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/draft-claim", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function baseSummary(overrides: Partial<ClaimSummary> = {}): ClaimSummary {
  return {
    occurredAtLocal: "2026-11-03T14:30",
    locationText: "Thika Road, near the Allsops roundabout",
    weather: "clear",
    light: "day",
    road: ["Tarmac"],
    anyoneInjured: false,
    shortDescription: "Rear-ended at the lights",
    userWords: "I was stopped at the lights when another car hit me.",
    ownVehicleMake: "Subaru",
    ownVehicleModel: "Forester",
    ownVehicleColour: "Blue",
    damageItems: [
      { vehicle: "own", photoRef: "photo-1", part: "rear bumper", damageType: "dent", severity: "moderate", description: "Dent on the rear bumper" },
    ],
    otherPartyInvolved: "yes",
    otherParties: [{ vehicleMake: "Toyota", insuranceOnFile: true, licenceOnFile: true, logbookOnFile: true, refusedToShare: false }],
    obNumberKnown: true,
    abstractObtained: false,
    witnessesPresent: "no",
    witnessStatements: [],
    ...overrides,
  };
}

describe("POST /api/draft-claim", () => {
  const originalMock = process.env.AJALI_MOCK;

  beforeEach(() => {
    createMock.mockReset();
    delete process.env.AJALI_MOCK;
  });

  afterEach(() => {
    if (originalMock === undefined) delete process.env.AJALI_MOCK;
    else process.env.AJALI_MOCK = originalMock;
    vi.useRealTimers();
  });

  it("rejects a malformed request body with ok:false, before touching the model", async () => {
    const res = await POST(request({ occurredAtLocal: "2026-11-03" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns a mock draft via the mock header with no model call", async () => {
    const res = await POST(request(baseSummary(), { "x-ajali-mock": "1" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.model).toBe("mock");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns the mock draft via AJALI_MOCK=1 with no header", async () => {
    process.env.AJALI_MOCK = "1";
    const res = await POST(request(baseSummary()));
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("the mock account mentions the actual location, time and confirmed damage parts from the summary", async () => {
    const summary = baseSummary({ locationText: "Ngong Road near the school", occurredAtLocal: "2026-11-03T09:15" });
    const res = await POST(request(summary, { "x-ajali-mock": "1" }));
    const json = await res.json();
    expect(json.data.account).toContain("Ngong Road near the school");
    expect(json.data.account).toContain("09:15");
    expect(json.data.account).toContain("rear bumper");
  });

  // Browser-run bug (a): the summary must carry local wall-clock time, not
  // the raw UTC instant Incident.occurredAt is stored as, or the account
  // shows a time hours off from what actually happened.
  it("the mock account uses the local time given in the summary, not a UTC-shifted one", async () => {
    const summary = baseSummary({ occurredAtLocal: "2026-11-03T11:38" });
    const res = await POST(request(summary, { "x-ajali-mock": "1" }));
    const json = await res.json();
    expect(json.data.account).toContain("11:38");
    expect(json.data.account).not.toContain("08:38");
  });

  it("the mock draft includes a consistency warning for a hit-from-behind account with front-only damage (A8)", async () => {
    const summary = baseSummary({
      userWords: "I was driving straight when I was hit from behind at the junction.",
      damageItems: [
        { vehicle: "own", photoRef: "photo-1", part: "front bumper", damageType: "dent", severity: "moderate", description: "Dent on the front bumper" },
      ],
    });
    const res = await POST(request(summary, { "x-ajali-mock": "1" }));
    const json = await res.json();
    expect(json.data.consistencyWarnings).toHaveLength(1);
    expect(json.data.consistencyWarnings[0].section).toBe("account");
    expect(json.data.consistencyWarnings[0].warning.toLowerCase()).toContain("behind");
  });

  it("the mock draft has no consistency warning when the account and damage agree", async () => {
    const summary = baseSummary({
      userWords: "I was hit from behind at the junction.",
      damageItems: [
        { vehicle: "own", photoRef: "photo-1", part: "rear bumper", damageType: "dent", severity: "moderate", description: "Dent on the rear bumper" },
      ],
    });
    const res = await POST(request(summary, { "x-ajali-mock": "1" }));
    const json = await res.json();
    expect(json.data.consistencyWarnings).toHaveLength(0);
  });

  // Codex review finding 6: "hit from behind" is a statement about the
  // driver's own vehicle, so the other vehicle's damage must not be able to
  // trigger, or hide, a contradiction about it.
  it("the mock draft ignores the other vehicle's damage when checking the driver's own hit-from-behind account", async () => {
    const summary = baseSummary({
      userWords: "I was hit from behind at the junction.",
      damageItems: [
        { vehicle: "own", photoRef: "photo-1", part: "rear bumper", damageType: "dent", severity: "moderate", description: "Dent on the rear bumper" },
        { vehicle: "other", photoRef: "photo-2", part: "front bumper", damageType: "dent", severity: "moderate", description: "Dent on the front bumper" },
      ],
    });
    const res = await POST(request(summary, { "x-ajali-mock": "1" }));
    const json = await res.json();
    expect(json.data.consistencyWarnings).toHaveLength(0);
  });

  it("the mock draft still warns on the driver's own front-only damage even with other-vehicle rear damage on file", async () => {
    const summary = baseSummary({
      userWords: "I was hit from behind at the junction.",
      damageItems: [
        { vehicle: "own", photoRef: "photo-1", part: "front bumper", damageType: "dent", severity: "moderate", description: "Dent on the front bumper" },
        { vehicle: "other", photoRef: "photo-2", part: "rear bumper", damageType: "dent", severity: "moderate", description: "Dent on the rear bumper" },
      ],
    });
    const res = await POST(request(summary, { "x-ajali-mock": "1" }));
    const json = await res.json();
    expect(json.data.consistencyWarnings).toHaveLength(1);
  });

  // Codex review finding 7: an involved other party with no record on file
  // yet is itself a missing detail, not a reason to stay silent about it.
  it("the mock draft flags missing other-party details when involved but no party record exists yet", async () => {
    const summary = baseSummary({ otherPartyInvolved: "yes", otherParties: [] });
    const res = await POST(request(summary, { "x-ajali-mock": "1" }));
    const json = await res.json();
    expect(json.data.missingItems.some((item: { item: string }) => item.item.toLowerCase().includes("insurance"))).toBe(true);
  });

  it("the mock draft flags a missing licence or logbook copy for an unscanned other party", async () => {
    const summary = baseSummary({
      otherPartyInvolved: "yes",
      otherParties: [{ vehicleMake: "Toyota", insuranceOnFile: true, licenceOnFile: false, logbookOnFile: false, refusedToShare: false }],
    });
    const res = await POST(request(summary, { "x-ajali-mock": "1" }));
    const json = await res.json();
    const items = json.data.missingItems.map((item: { item: string }) => item.item.toLowerCase());
    expect(items.some((item: string) => item.includes("licence"))).toBe(true);
    expect(items.some((item: string) => item.includes("logbook"))).toBe(true);
  });

  it("parses a real structured-output response into the mapped shape", async () => {
    createMock.mockResolvedValue({
      output_text: JSON.stringify({
        account: "I was stopped at the lights when another car hit me.",
        damage_schedule: [{ vehicle: "own", part: "rear bumper", damage: "dent", photo_refs: ["photo-1"] }],
        missing_items: [{ item: "Police OB number", why: "Not recorded yet." }],
        consistency_warnings: [],
        questions_for_user: [],
      }),
      usage: { input_tokens: 10, output_tokens: 5 },
    });
    const res = await POST(request(baseSummary()));
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.account).toContain("stopped at the lights");
    expect(json.data.damageSchedule).toHaveLength(1);
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("retries once on an invalid JSON response, then succeeds", async () => {
    vi.useFakeTimers();
    createMock
      .mockResolvedValueOnce({ output_text: "not json", usage: {} })
      .mockResolvedValueOnce({
        output_text: JSON.stringify({
          account: "Account text.",
          damage_schedule: [],
          missing_items: [],
          consistency_warnings: [],
          questions_for_user: [],
        }),
        usage: {},
      });
    const resPromise = POST(request(baseSummary()));
    await vi.advanceTimersByTimeAsync(5000);
    const res = await resPromise;
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.account).toBe("Account text.");
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after repeated schema-invalid responses and returns ok:false", async () => {
    vi.useFakeTimers();
    createMock.mockResolvedValue({ output_text: JSON.stringify({ not: "the expected shape" }), usage: {} });
    const resPromise = POST(request(baseSummary()));
    await vi.advanceTimersByTimeAsync(30000);
    const res = await resPromise;
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(createMock).toHaveBeenCalledTimes(4);
  });
});
