import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ClassifiedReview } from "../types";
import type { LlmClient } from "./LlmClient";
import { GROUP_TOPICS_PROMPT_VERSION, type TopicItem } from "./prompts";
import { topicGroupsSchema } from "./schema";

/** "category|raw topic" → merged label. */
type Mapping = Record<string, string>;

const keyOf = (review: { category: string; topic: string }) => `${review.category}|${review.topic}`;

/**
 * Second LLM pass. Batches are classified independently, so the same problem comes back
 * under several wordings; one extra request per category groups the raw topics into a few
 * themes. The result is cached by the exact set of topics, so repeating an analysis costs no
 * LLM call. If the pass fails for a category, its raw topics are kept: this step only
 * polishes the result.
 */
export class TopicGrouper {
  constructor(
    private readonly llm: LlmClient,
    private readonly cacheFile: string,
    private readonly cacheScope: string,
  ) {}

  async group(
    reviews: ClassifiedReview[],
    signal?: AbortSignal,
  ): Promise<{ reviews: ClassifiedReview[]; llmCalls: number }> {
    const cache = await this.readCache();
    const merged: Mapping = {};
    let llmCalls = 0;

    // One request per category: a small, focused task. A single request with every topic
    // made reasoning models run out of output before they wrote the answer.
    for (const items of topicsByCategory(reviews)) {
      if (items.length < 2) continue;
      // Aborted: start no new requests, but still save the categories that are done.
      if (signal?.aborted) break;

      const cacheKey = createHash("sha256")
        .update(`${GROUP_TOPICS_PROMPT_VERSION}\n${this.cacheScope}\n${JSON.stringify(items.map(keyOf))}`)
        .digest("hex");

      let mapping = cache[cacheKey];
      if (!mapping) {
        llmCalls++;
        mapping = await this.askLlm(items);
        if (!mapping) continue; // this category keeps its raw topics
        cache[cacheKey] = mapping;
      }
      Object.assign(merged, mapping);
    }

    if (llmCalls > 0) {
      await mkdir(path.dirname(this.cacheFile), { recursive: true });
      await writeFile(this.cacheFile, JSON.stringify(cache));
    }
    signal?.throwIfAborted();

    return {
      reviews: reviews.map((review) => ({ ...review, topic: merged[keyOf(review)] ?? review.topic })),
      llmCalls,
    };
  }

  /** Returns undefined when the LLM fails or its output is invalid. */
  private async askLlm(items: TopicItem[]): Promise<Mapping | undefined> {
    let raw: unknown;
    try {
      raw = await this.llm.groupTopics(items);
    } catch (error) {
      console.warn("Topic grouping failed, raw topics are kept:", (error as Error).message);
      return undefined;
    }
    const parsed = topicGroupsSchema.safeParse(raw);
    if (!parsed.success) return undefined;

    const mapping: Mapping = {};
    for (const { label, indexes } of parsed.data.groups) {
      if (!label.trim()) continue;
      for (const index of indexes) {
        const item = items[index];
        // A topic claimed by two groups stays in the first one.
        if (item && !(keyOf(item) in mapping)) mapping[keyOf(item)] = label.trim();
      }
    }
    return mapping;
  }

  private async readCache(): Promise<Record<string, Mapping>> {
    try {
      return JSON.parse(await readFile(this.cacheFile, "utf8"));
    } catch {
      return {};
    }
  }
}

/**
 * The distinct topics of every category with how many reviews each has. Sorted, so the same
 * set of topics always produces the same request and the same cache key.
 */
function topicsByCategory(reviews: ClassifiedReview[]): TopicItem[][] {
  const categories = new Map<string, Map<string, number>>();
  for (const { category, topic } of reviews) {
    if (!topic) continue;
    const topics = categories.get(category) ?? new Map<string, number>();
    topics.set(topic, (topics.get(topic) ?? 0) + 1);
    categories.set(category, topics);
  }

  return [...categories]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, topics]) =>
      [...topics]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([topic, count], index) => ({ index, category, topic, reviews: count })),
    );
}
