import { describe, expect, it } from "vitest";
import { MergedSource } from "../src/sources/MergedSource";
import type { ReviewSource } from "../src/sources/ReviewSource";
import type { Review } from "../src/types";

const review = (id: string, day: number): Review => ({
  id,
  text: `text ${id}`,
  score: 5,
  date: `2026-01-${String(day).padStart(2, "0")}T00:00:00.000Z`,
});

const source = (reviews: Review[]): ReviewSource => ({ fetch: async () => reviews });
const broken: ReviewSource = {
  fetch: async () => {
    throw new Error("network down");
  },
};

describe("MergedSource", () => {
  it("merges sources, removes duplicates and puts the newest first", async () => {
    const merged = new MergedSource(
      [source([review("a", 1), review("b", 5)]), source([review("b", 5), review("c", 3)])],
      10,
    );

    expect((await merged.fetch()).map((r) => r.id)).toEqual(["b", "c", "a"]);
  });

  it("applies the limit to the merged list", async () => {
    const merged = new MergedSource([source([review("a", 1), review("b", 5)]), source([review("c", 3)])], 2);

    expect((await merged.fetch()).map((r) => r.id)).toEqual(["b", "c"]);
  });

  it("survives a failing source but fails when every source fails", async () => {
    expect(await new MergedSource([broken, source([review("a", 1)])], 10).fetch()).toHaveLength(1);
    await expect(new MergedSource([broken, broken], 10).fetch()).rejects.toThrow("network down");
  });
});
