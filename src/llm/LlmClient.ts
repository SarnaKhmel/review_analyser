import type { Review } from "../types";
import type { TopicItem } from "./prompts";

/**
 * The only thing the app needs from an LLM. Keeping it behind an interface lets the
 * classifier and the chat be tested with a fake and the provider be swapped.
 */
export interface LlmClient {
  /** Returns the raw structured output for a batch; the caller validates it. */
  classifyBatch(reviews: Review[]): Promise<unknown>;
  /** Returns the raw structured output of the topic-merging pass; the caller validates it. */
  groupTopics(items: TopicItem[]): Promise<unknown>;
  answer(system: string, question: string): Promise<string>;
}
