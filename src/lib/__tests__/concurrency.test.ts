import { describe, expect, it } from "vitest";

import { mapWithConcurrency } from "../concurrency";

describe("mapWithConcurrency", () => {
  it("never runs more than the limit at once", async () => {
    let active = 0;
    let maxActive = 0;
    const items = Array.from({ length: 10 }, (_, i) => i);
    await mapWithConcurrency(items, 3, async (item) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return item;
    });
    expect(maxActive).toBeLessThanOrEqual(3);
  });

  it("returns results in input order regardless of completion order", async () => {
    const items = [30, 10, 20];
    const result = await mapWithConcurrency(items, 3, async (ms) => {
      await new Promise((resolve) => setTimeout(resolve, ms));
      return ms;
    });
    expect(result).toEqual([30, 10, 20]);
  });

  it("processes every item exactly once", async () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    const seen: number[] = [];
    await mapWithConcurrency(items, 3, async (item) => {
      seen.push(item);
      return item;
    });
    expect(seen.slice().sort((a, b) => a - b)).toEqual(items);
  });

  it("works with a limit larger than the item count", async () => {
    const result = await mapWithConcurrency([1, 2], 3, async (item) => item * 2);
    expect(result).toEqual([2, 4]);
  });

  it("propagates a rejection from one task", async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (item) => {
        if (item === 2) throw new Error("boom");
        return item;
      }),
    ).rejects.toThrow("boom");
  });
});
