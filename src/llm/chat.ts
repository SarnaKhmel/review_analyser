import type { Analytics, ClassifiedReview } from "../types";
import type { LlmClient } from "./LlmClient";
import { CHAT_SYSTEM_PROMPT } from "./prompts";

const MAX_REVIEW_CHARS = 400;
const CHAT_PROBLEMS = 8;
// Rough size of the JSON fields around each review text.
const REVIEW_OVERHEAD_CHARS = 80;
const SEVERITY_RANK = { high: 0, medium: 1, low: 2 } as const;

/**
 * Answers a natural-language question from the aggregates plus a sample of reviews.
 * Sending aggregates instead of every review keeps the request small (cost) and lets
 * the model quote exact numbers.
 */
export async function answerQuestion(
  llm: LlmClient,
  question: string,
  reviews: ClassifiedReview[],
  analytics: Analytics,
  contextChars: number,
): Promise<string> {
  // The ticket payloads duplicate the statistics, so they are left out of the context.
  // Examples are cut to quotes: the full texts would not fit a small context budget.
  const topProblems = analytics.topProblems.slice(0, CHAT_PROBLEMS).map(({ ticket, examples, ...problem }) => ({
    ...problem,
    examples: examples.slice(0, 2).map((example) => example.text.slice(0, 160)),
  }));

  const sample = pickSample(reviews, contextChars);
  const context = {
    statistics: { ...analytics, topProblems },
    sampleNote: `${sample.length} of ${reviews.length} reviews, most severe first; long texts are cut`,
    sample,
  };

  return llm.answer(
    CHAT_SYSTEM_PROMPT,
    `<data>\n${JSON.stringify(context)}\n</data>\n\nQuestion: ${question}`,
  );
}

/** Takes the most severe reviews first until the character budget is used up. */
function pickSample(reviews: ClassifiedReview[], contextChars: number) {
  const bySeverity = [...reviews].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);

  const sample = [];
  let used = 0;
  for (const { text, score, sentiment, category, severity, intensity, topic } of bySeverity) {
    const cut = text.length > MAX_REVIEW_CHARS ? `${text.slice(0, MAX_REVIEW_CHARS)}…` : text;
    used += cut.length + REVIEW_OVERHEAD_CHARS;
    if (used > contextChars) break;
    sample.push({ stars: score, sentiment, intensity, category, severity, topic, text: cut });
  }
  return sample;
}
