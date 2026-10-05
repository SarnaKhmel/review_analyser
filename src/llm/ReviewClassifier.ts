import type { Classification, ClassifiedReview, ClassifyStats, Review } from "../types";
import type { ClassificationCache } from "./ClassificationCache";
import type { LlmClient } from "./LlmClient";
import { CLASSIFY_PROMPT_VERSION } from "./prompts";
import { batchSchema } from "./schema";

/** Used when the LLM output stays invalid after a retry. Never written to the cache. */
export const FALLBACK: Classification = {
  sentiment: "neutral",
  category: "other",
  severity: "low",
  intensity: "mild",
  topic: "",
};

const MAX_ATTEMPTS = 2;

/**
 * Cache scope = model + prompt version. Version 1 adds nothing, so the entries written
 * before the version existed stay valid.
 */
export function classifyCacheScope(modelScope = "", promptVersion = CLASSIFY_PROMPT_VERSION): string {
  return promptVersion === 1 ? modelScope : `${modelScope}|prompt-v${promptVersion}`;
}

type Options = { batchSize: number; concurrency: number; cacheScope?: string };

export class ReviewClassifier {
  constructor(
    private readonly llm: LlmClient,
    private readonly cache: ClassificationCache,
    private readonly options: Options,
  ) {}

  /** `onProgress` receives the reviews classified so far: after the cache lookup and after every batch. */
  async classify(
    reviews: Review[],
    onProgress?: (classified: ClassifiedReview[]) => void,
  ): Promise<{ reviews: ClassifiedReview[]; stats: ClassifyStats }> {
    const cacheScope = classifyCacheScope(this.options.cacheScope);
    const stats: ClassifyStats = {
      total: reviews.length,
      fromCache: 0,
      fromLlm: 0,
      fallbacks: 0,
      llmCalls: 0,
    };
    const classified = new Map<string, Classification>();

    // 1. Cache: only reviews we have not seen before go to the LLM.
    const pending: Review[] = [];
    for (const review of reviews) {
      const cached = await this.cache.get(review.text, cacheScope);
      if (cached) {
        classified.set(review.id, cached);
        stats.fromCache++;
      } else {
        pending.push(review);
      }
    }

    const merge = () =>
      reviews.flatMap((review) => {
        const classification = classified.get(review.id);
        return classification ? [{ ...review, ...classification }] : [];
      });
    onProgress?.(merge());

    // 2. Batching: one request per `batchSize` reviews, a few requests in parallel.
    const batches = chunk(pending, this.options.batchSize);
    for (const group of chunk(batches, this.options.concurrency)) {
      await Promise.all(
        group.map(async (batch) => {
          const results = await this.classifyBatch(batch, stats);
          for (const review of batch) {
            const result = results.get(review.id);
            if (result) {
              await this.cache.set(review.text, result, cacheScope);
              stats.fromLlm++;
            } else {
              stats.fallbacks++;
            }
            classified.set(review.id, result ?? FALLBACK);
          }
          onProgress?.(merge());
        }),
      );
      // Saved after every group, so an interrupted run does not pay for the same reviews twice.
      await this.cache.save();
    }

    return { reviews: merge(), stats };
  }

  /**
   * Guardrail: validates the LLM output and retries once with the reviews that are still
   * missing. Reviews absent from the returned map get the fallback classification.
   */
  private async classifyBatch(batch: Review[], stats: ClassifyStats): Promise<Map<string, Classification>> {
    const done = new Map<string, Classification>();
    let remaining = batch;

    for (let attempt = 0; attempt < MAX_ATTEMPTS && remaining.length > 0; attempt++) {
      stats.llmCalls++;
      const parsed = batchSchema.safeParse(await this.llm.classifyBatch(remaining));
      if (!parsed.success) continue;

      for (const { index, ...classification } of parsed.data.results) {
        const review = remaining[index];
        if (review) done.set(review.id, classification);
      }
      remaining = remaining.filter((review) => !done.has(review.id));
    }
    return done;
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}
