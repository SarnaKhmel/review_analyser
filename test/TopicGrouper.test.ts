import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { LlmClient } from "../src/llm/LlmClient";
import { TopicGrouper } from "../src/llm/TopicGrouper";
import type { ClassifiedReview } from "../src/types";

function review(id: string, topic: string, category: ClassifiedReview["category"] = "bug"): ClassifiedReview {
  return {
    id,
    topic,
    category,
    text: `text ${id}`,
    score: 1,
    date: "2026-01-01T00:00:00.000Z",
    sentiment: "negative",
    severity: "high",
    intensity: "strong",
  };
}

/** Fake LLM that answers the grouping pass with a canned response. */
function fakeLlm(response: unknown | Error) {
  const llm = {
    calls: 0,
    classifyBatch: async () => null,
    answer: async () => "",
    groupTopics: async () => {
      llm.calls++;
      if (response instanceof Error) throw response;
      return response;
    },
  };
  return llm satisfies LlmClient;
}

// Sorted unique topics: 0 = "app crashes", 1 = "crash on start", 2 = "login fails".
const reviews = [review("1", "crash on start"), review("2", "app crashes"), review("3", "login fails")];

describe("TopicGrouper", () => {
  let cacheFile: string;

  beforeEach(async () => {
    cacheFile = path.join(await mkdtemp(path.join(tmpdir(), "topic-cache-")), "groups.json");
  });

  it("renames merged topics and leaves the rest untouched", async () => {
    const llm = fakeLlm({ groups: [{ label: "crashes", indexes: [0, 1] }] });

    const result = await new TopicGrouper(llm, cacheFile, "m").group(reviews);

    expect(result.reviews.map((r) => r.topic)).toEqual(["crashes", "crashes", "login fails"]);
    expect(result.llmCalls).toBe(1);
  });

  it("answers from the cache for the same set of topics", async () => {
    await new TopicGrouper(fakeLlm({ groups: [{ label: "crashes", indexes: [0, 1] }] }), cacheFile, "m").group(
      reviews,
    );
    const llm = fakeLlm({ groups: [] });

    const result = await new TopicGrouper(llm, cacheFile, "m").group(reviews);

    expect(llm.calls).toBe(0);
    expect(result.llmCalls).toBe(0);
    expect(result.reviews[0]?.topic).toBe("crashes");
  });

  it("keeps raw topics when the output is invalid or the LLM fails", async () => {
    for (const response of [{ groups: "nope" }, null, new Error("rate limited")]) {
      const result = await new TopicGrouper(fakeLlm(response), cacheFile, "m").group(reviews);
      expect(result.reviews.map((r) => r.topic)).toEqual(["crash on start", "app crashes", "login fails"]);
    }
  });

  it("asks once per category and never merges across categories", async () => {
    const llm = fakeLlm({ groups: [{ label: "merged", indexes: [0, 1] }] });
    const mixed = [
      review("1", "crash on start"),
      review("2", "app crashes"),
      review("3", "too expensive", "pricing"),
      review("4", "price went up", "pricing"),
      review("5", "no support", "support"),
    ];

    const result = await new TopicGrouper(llm, cacheFile, "m").group(mixed);

    // bug and pricing have two topics each; support has one, so there is nothing to merge.
    expect(llm.calls).toBe(2);
    expect(result.reviews.map((r) => r.topic)).toEqual(["merged", "merged", "merged", "merged", "no support"]);
  });

  it("ignores indexes that do not exist and skips the LLM when there is nothing to merge", async () => {
    const llm = fakeLlm({ groups: [{ label: "crashes", indexes: [0, 99] }] });
    const result = await new TopicGrouper(llm, cacheFile, "m").group(reviews);
    expect(result.reviews.map((r) => r.topic)).toEqual(["crash on start", "crashes", "login fails"]);

    const single = fakeLlm({ groups: [] });
    await new TopicGrouper(single, cacheFile, "m").group([review("1", "crash on start")]);
    expect(single.calls).toBe(0);
  });
});
