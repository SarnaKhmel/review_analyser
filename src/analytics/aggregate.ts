import {
  CATEGORIES,
  type Analytics,
  type Category,
  type ClassifiedReview,
  type Severity,
  type TopProblem,
} from "../types";
import { buildTicketPayload } from "./ticket";

const SEVERITY_WEIGHT: Record<Severity, number> = { high: 3, medium: 2, low: 1 };
const TOP_PROBLEMS = 15;
const EXAMPLES_PER_PROBLEM = 5;

/** Pure function: classified reviews in, numbers for the dashboard out. */
export function aggregate(appId: string, reviews: ClassifiedReview[]): Analytics {
  const total = reviews.length;

  const sentimentByScore: Analytics["sentimentByScore"] = {
    positive: [0, 0, 0, 0, 0],
    neutral: [0, 0, 0, 0, 0],
    negative: [0, 0, 0, 0, 0],
  };
  const categoryCounts = new Map<Category, number>();
  let scoreSum = 0;

  for (const review of reviews) {
    const column = review.score - 1;
    const row = sentimentByScore[review.sentiment];
    if (row[column] !== undefined) row[column]++;
    categoryCounts.set(review.category, (categoryCounts.get(review.category) ?? 0) + 1);
    scoreSum += review.score;
  }

  const categories = CATEGORIES.map((category) => {
    const count = categoryCounts.get(category) ?? 0;
    return { category, count, share: total ? count / total : 0 };
  })
    .filter((stat) => stat.count > 0)
    .sort((a, b) => b.count - a.count);

  return {
    total,
    averageScore: total ? scoreSum / total : 0,
    sentimentByScore,
    categories,
    topProblems: findTopProblems(appId, reviews),
  };
}

/**
 * A "problem" is a group of non-positive reviews (praise excluded) that share a category
 * and a topic. Ranked by severity weight, so ten minor remarks do not outrank five blockers.
 */
function findTopProblems(appId: string, reviews: ClassifiedReview[]): TopProblem[] {
  const groups = new Map<string, ClassifiedReview[]>();
  for (const review of reviews) {
    if (review.category === "praise" || review.sentiment === "positive") continue;
    const key = `${review.category}|${review.topic}`;
    groups.set(key, [...(groups.get(key) ?? []), review]);
  }

  return [...groups.values()]
    .map((items) => {
      const { category, topic } = items[0]!;
      const bySeverity: Record<Severity, number> = { low: 0, medium: 0, high: 0 };
      let weight = 0;
      for (const item of items) {
        bySeverity[item.severity]++;
        weight += SEVERITY_WEIGHT[item.severity];
      }
      // Longer reviews first among equally severe ones: they describe the problem better.
      const examples = [...items]
        .sort(
          (a, b) =>
            SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity] || b.text.length - a.text.length,
        )
        .slice(0, EXAMPLES_PER_PROBLEM)
        .map(({ id, text, score, date }) => ({ id, text, score, date }));

      const summary = { category, topic, count: items.length, bySeverity, examples };
      return { ...summary, weight, ticket: buildTicketPayload(appId, summary) };
    })
    .sort((a, b) => b.weight - a.weight || b.count - a.count)
    .slice(0, TOP_PROBLEMS);
}
