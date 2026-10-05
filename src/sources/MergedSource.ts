import type { Review } from "../types";
import type { ReviewSource } from "./ReviewSource";

/**
 * Combines several sources into one: used for "all languages", where Google Play has to be
 * asked once per language. Duplicates are removed by id, the newest reviews come first.
 */
export class MergedSource implements ReviewSource {
  constructor(
    private readonly sources: ReviewSource[],
    private readonly limit: number,
  ) {}

  async fetch(): Promise<Review[]> {
    // One failed language should not lose the others.
    const results = await Promise.allSettled(this.sources.map((source) => source.fetch()));

    const failed = results.find((result) => result.status === "rejected");
    if (failed && results.every((result) => result.status === "rejected")) throw failed.reason;

    const byId = new Map<string, Review>();
    for (const result of results) {
      if (result.status !== "fulfilled") continue;
      for (const review of result.value) byId.set(review.id, review);
    }

    return [...byId.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, this.limit);
  }
}
