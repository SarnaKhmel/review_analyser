import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { ClassificationCache } from "../src/llm/ClassificationCache";
import type { LlmClient } from "../src/llm/LlmClient";
import { classifyCacheScope, FALLBACK, ReviewClassifier } from "../src/llm/ReviewClassifier";
import type { Review } from "../src/types";

const GOOD = { sentiment: "negative", category: "bug", severity: "high", intensity: "strong", topic: "crash" } as const;

/** Fake LLM: answers from a queue of canned responses, or classifies everything as GOOD. */
class FakeLlm implements LlmClient {
  calls: Review[][] = [];
  constructor(private readonly responses: unknown[] = []) {}

  async classifyBatch(reviews: Review[]): Promise<unknown> {
    this.calls.push(reviews);
    if (this.responses.length > 0) return this.responses.shift();
    return { results: reviews.map((_, index) => ({ index, ...GOOD })) };
  }

  async groupTopics(): Promise<unknown> {
    return { groups: [] };
  }

  async answer(): Promise<string> {
    return "";
  }
}

function makeReviews(count: number): Review[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `r${i}`,
    text: `review number ${i}`,
    score: 1,
    date: "2026-01-01T00:00:00.000Z",
  }));
}

describe("ReviewClassifier", () => {
  let cacheFile: string;
  const options = { batchSize: 10, concurrency: 2 };

  beforeEach(async () => {
    cacheFile = path.join(await mkdtemp(path.join(tmpdir(), "review-cache-")), "cache.json");
  });

  it("sends reviews in batches instead of one by one", async () => {
    const llm = new FakeLlm();
    const classifier = new ReviewClassifier(llm, new ClassificationCache(cacheFile), options);

    const { reviews, stats } = await classifier.classify(makeReviews(25));

    expect(llm.calls.map((batch) => batch.length)).toEqual([10, 10, 5]);
    expect(stats).toEqual({ total: 25, fromCache: 0, fromLlm: 25, fallbacks: 0, llmCalls: 3 });
    expect(reviews).toHaveLength(25);
    expect(reviews[0]).toMatchObject({ id: "r0", ...GOOD });
  });

  it("does not call the LLM again for cached texts, even from a new process", async () => {
    await new ReviewClassifier(new FakeLlm(), new ClassificationCache(cacheFile), options).classify(
      makeReviews(5),
    );

    const llm = new FakeLlm();
    const classifier = new ReviewClassifier(llm, new ClassificationCache(cacheFile), options);
    const { stats } = await classifier.classify(makeReviews(7));

    expect(stats).toMatchObject({ fromCache: 5, fromLlm: 2, llmCalls: 1 });
    expect(llm.calls[0]?.map((review) => review.id)).toEqual(["r5", "r6"]);
  });

  it("reports progress after the cache lookup and after every batch", async () => {
    // One batch at a time, so the order of progress events is deterministic.
    const classifier = new ReviewClassifier(new FakeLlm(), new ClassificationCache(cacheFile), {
      batchSize: 10,
      concurrency: 1,
    });
    const seen: number[] = [];

    await classifier.classify(makeReviews(25), (classified) => seen.push(classified.length));

    expect(seen).toEqual([0, 10, 20, 25]);
  });

  it("keeps a separate cache per model", async () => {
    const cache = new ClassificationCache(cacheFile);
    await new ReviewClassifier(new FakeLlm(), cache, { ...options, cacheScope: "model-a" }).classify(
      makeReviews(3),
    );

    const sameModel = await new ReviewClassifier(new FakeLlm(), cache, {
      ...options,
      cacheScope: "model-a",
    }).classify(makeReviews(3));
    const otherModel = await new ReviewClassifier(new FakeLlm(), cache, {
      ...options,
      cacheScope: "model-b",
    }).classify(makeReviews(3));

    expect(sameModel.stats).toMatchObject({ fromCache: 3, llmCalls: 0 });
    expect(otherModel.stats).toMatchObject({ fromCache: 0, fromLlm: 3, llmCalls: 1 });
  });

  it("retries after invalid output and uses the second answer", async () => {
    const llm = new FakeLlm([{ results: [{ index: 0, sentiment: "angry" }] }]);
    const classifier = new ReviewClassifier(llm, new ClassificationCache(cacheFile), options);

    const { reviews, stats } = await classifier.classify(makeReviews(2));

    expect(stats).toMatchObject({ fromLlm: 2, fallbacks: 0, llmCalls: 2 });
    expect(reviews.every((review) => review.category === "bug")).toBe(true);
  });

  it("retries only the reviews the LLM skipped", async () => {
    const llm = new FakeLlm([{ results: [{ index: 1, ...GOOD }] }]);
    const classifier = new ReviewClassifier(llm, new ClassificationCache(cacheFile), options);

    const { stats } = await classifier.classify(makeReviews(3));

    expect(llm.calls[1]?.map((review) => review.id)).toEqual(["r0", "r2"]);
    expect(stats).toMatchObject({ fromLlm: 3, fallbacks: 0, llmCalls: 2 });
  });

  it("falls back to 'other' when the output stays invalid, and does not cache the fallback", async () => {
    const cache = new ClassificationCache(cacheFile);
    const classifier = new ReviewClassifier(new FakeLlm([null, "not json"]), cache, options);

    const { reviews, stats } = await classifier.classify(makeReviews(2));

    expect(stats).toMatchObject({ fromLlm: 0, fallbacks: 2, llmCalls: 2 });
    expect(reviews[0]).toMatchObject(FALLBACK);
    expect(await cache.get("review number 0")).toBeUndefined();
  });

  it("changes the cache scope when the prompt version is bumped", () => {
    // Version 1 keeps the scope as is: entries cached before versioning stay valid.
    expect(classifyCacheScope("model-a", 1)).toBe("model-a");
    expect(classifyCacheScope("model-a", 2)).not.toBe(classifyCacheScope("model-a", 1));
    expect(classifyCacheScope("model-a", 2)).not.toBe(classifyCacheScope("model-a", 3));
  });

  it("starts no new batches after an abort, and keeps the finished ones in the cache", async () => {
    const abort = new AbortController();
    const llm = new FakeLlm();
    const cache = new ClassificationCache(cacheFile);
    const classifier = new ReviewClassifier(llm, cache, options);

    // 45 reviews = 5 batches in groups of 2; the client leaves during the first group.
    const run = classifier.classify(
      makeReviews(45),
      (classified) => {
        if (classified.length > 0) abort.abort();
      },
      abort.signal,
    );

    await expect(run).rejects.toMatchObject({ name: "AbortError" });
    expect(llm.calls).toHaveLength(2);
    expect(await new ClassificationCache(cacheFile).get("review number 0")).toMatchObject(GOOD);
  });
});
