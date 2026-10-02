import { describe, expect, it } from "vitest";
import { aggregate } from "../src/analytics/aggregate";
import type { ClassifiedReview } from "../src/types";

type Labels = Pick<ClassifiedReview, "sentiment" | "category" | "severity" | "topic">;

function review(id: string, score: number, labels: Labels, text = `text ${id}`): ClassifiedReview {
  return { id, score, text, date: "2026-01-01T00:00:00.000Z", intensity: "mild", ...labels };
}

const reviews: ClassifiedReview[] = [
  review("1", 1, { sentiment: "negative", category: "bug", severity: "high", topic: "crash" }),
  review("2", 1, { sentiment: "negative", category: "pricing", severity: "medium", topic: "double charge" }),
  review("3", 2, { sentiment: "negative", category: "pricing", severity: "low", topic: "double charge" }),
  review("4", 3, { sentiment: "neutral", category: "pricing", severity: "low", topic: "too expensive" }),
  review("5", 5, { sentiment: "positive", category: "praise", severity: "low", topic: "general praise" }),
  review("6", 5, { sentiment: "positive", category: "feature", severity: "low", topic: "dark theme" }),
];

describe("aggregate", () => {
  const analytics = aggregate("com.example.app", reviews);

  it("builds the sentiment × stars table", () => {
    expect(analytics.sentimentByScore).toEqual({
      positive: [0, 0, 0, 0, 2],
      neutral: [0, 0, 1, 0, 0],
      negative: [2, 1, 0, 0, 0],
    });
    expect(analytics.total).toBe(6);
    expect(analytics.averageScore).toBeCloseTo(17 / 6);
  });

  it("counts categories, most frequent first, without empty ones", () => {
    expect(analytics.categories.map((c) => [c.category, c.count])).toEqual([
      ["pricing", 3],
      ["bug", 1],
      ["feature", 1],
      ["praise", 1],
    ]);
    expect(analytics.categories[0]?.share).toBe(0.5);
  });

  it("groups problems by category and topic, ranks by severity weight, ignores praise and positive", () => {
    expect(analytics.topProblems.map((p) => [p.category, p.topic, p.count, p.weight])).toEqual([
      ["pricing", "double charge", 2, 3],
      ["bug", "crash", 1, 3],
      ["pricing", "too expensive", 1, 1],
    ]);
  });

  it("keeps full review texts as examples, most severe first", () => {
    const long = "x".repeat(1000);
    const result = aggregate("com.example.app", [
      review("a", 2, { sentiment: "negative", category: "bug", severity: "low", topic: "crash" }),
      review("b", 1, { sentiment: "negative", category: "bug", severity: "high", topic: "crash" }, long),
    ]);

    expect(result.topProblems[0]?.examples.map((e) => e.id)).toEqual(["b", "a"]);
    expect(result.topProblems[0]?.examples[0]?.text).toBe(long);
    expect(result.topProblems[0]?.ticket.description).toContain(long);
  });

  it("attaches a ticket payload to every problem", () => {
    const ticket = analytics.topProblems[1]?.ticket;
    expect(ticket).toMatchObject({ issueType: "Bug", priority: "High", labels: ["user-feedback", "bug"] });
    expect(ticket?.summary).toBe("[com.example.app] crash (1 user reviews)");
  });

  it("handles an empty list", () => {
    const empty = aggregate("com.example.app", []);
    expect(empty.total).toBe(0);
    expect(empty.averageScore).toBe(0);
    expect(empty.topProblems).toEqual([]);
  });
});
