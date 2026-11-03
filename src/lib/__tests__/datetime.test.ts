import { describe, expect, it } from "vitest";

import { formatLocalDate, formatLocalDateTime, fromLocalInputValue, toLocalInputValue } from "../datetime";

describe("datetime", () => {
  it("renders an ISO string as a local datetime-local value", () => {
    const d = new Date(2026, 10, 3, 14, 30); // local time, no offset ambiguity
    expect(toLocalInputValue(d.toISOString())).toBe("2026-11-03T14:30");
  });

  it("round-trips a datetime-local value back to an ISO string", () => {
    const iso = fromLocalInputValue("2026-11-03T14:30");
    expect(toLocalInputValue(iso)).toBe("2026-11-03T14:30");
  });

  it("pads single-digit months, days, hours and minutes", () => {
    const d = new Date(2026, 0, 2, 3, 5);
    expect(toLocalInputValue(d.toISOString())).toBe("2026-01-02T03:05");
  });

  it("formats a local date for the claim pack", () => {
    expect(formatLocalDate("2026-11-03")).toBe("3 Nov 2026");
    expect(formatLocalDate("2026-11-03T14:30")).toBe("3 Nov 2026");
  });

  it("formats a local date and time for the claim pack", () => {
    expect(formatLocalDateTime("2026-11-03T14:30")).toBe("3 Nov 2026, 14:30");
  });

  it("falls back to the date alone when there is no time part", () => {
    expect(formatLocalDateTime("2026-11-03")).toBe("3 Nov 2026");
  });
});
