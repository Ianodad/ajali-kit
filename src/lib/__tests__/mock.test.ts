import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MOCK_HEADER, isMockEnabled } from "../mock";

function headers(entries: Record<string, string>) {
  return {
    get(name: string): string | null {
      return entries[name] ?? null;
    },
  };
}

describe("isMockEnabled", () => {
  const original = process.env.AJALI_MOCK;

  beforeEach(() => {
    delete process.env.AJALI_MOCK;
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.AJALI_MOCK;
    } else {
      process.env.AJALI_MOCK = original;
    }
  });

  it("is on when AJALI_MOCK=1, with no headers", () => {
    process.env.AJALI_MOCK = "1";
    expect(isMockEnabled()).toBe(true);
  });

  it("is off when AJALI_MOCK is unset and no headers", () => {
    expect(isMockEnabled()).toBe(false);
  });

  it("is off when AJALI_MOCK has any other value", () => {
    process.env.AJALI_MOCK = "0";
    expect(isMockEnabled()).toBe(false);
  });

  it("is on when the x-ajali-mock header is 1", () => {
    expect(isMockEnabled(headers({ [MOCK_HEADER]: "1" }))).toBe(true);
  });

  it("is off when the header is present but not 1", () => {
    expect(isMockEnabled(headers({ [MOCK_HEADER]: "0" }))).toBe(false);
  });

  it("the env var wins even if the header is not set", () => {
    process.env.AJALI_MOCK = "1";
    expect(isMockEnabled(headers({}))).toBe(true);
  });
});
