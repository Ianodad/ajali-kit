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
    occurredAt: "2026-11-03T14:30:00+03:00",
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
    otherParties: [{ vehicleMake: "Toyota", insuranceOnFile: true, refusedToShare: false }],
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
    const res = await POST(request({ occurredAt: "2026-11-03" }));
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
    const summary = baseSummary({ locationText: "Ngong Road near the school", occurredAt: "2026-11-03T09:15:00+03:00" });
    const res = await POST(request(summary, { "x-ajali-mock": "1" }));
    const json = await res.json();
    expect(json.data.account).toContain("Ngong Road near the school");
    expect(json.data.account).toContain("09:15");
    expect(json.data.account).toContain("rear bumper");
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
