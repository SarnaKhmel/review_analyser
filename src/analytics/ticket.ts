import type { Category, Review, Severity, TicketPayload } from "../types";

type ProblemSummary = {
  category: Category;
  topic: string;
  count: number;
  bySeverity: Record<Severity, number>;
  examples: Review[];
};

/**
 * Builds a Jira-style ticket payload for a problem group. Nothing is sent anywhere:
 * real Jira integration is out of the MVP scope.
 */
export function buildTicketPayload(appId: string, problem: ProblemSummary): TicketPayload {
  const { category, topic, count, bySeverity, examples } = problem;
  const priority = bySeverity.high > 0 ? "High" : bySeverity.medium > 0 ? "Medium" : "Low";
  const title = topic || category;

  return {
    summary: `[${appId}] ${title} (${count} user reviews)`,
    description: [
      `Category: ${category}`,
      `Reviews: ${count} (severity: high ${bySeverity.high}, medium ${bySeverity.medium}, low ${bySeverity.low})`,
      "",
      "User reviews (full text):",
      // Full texts: the person who picks the ticket up should not need to look the reviews up.
      ...examples.map((example) => `- ${example.score}★ ${example.date.slice(0, 10)}: ${example.text}`),
    ].join("\n"),
    issueType: category === "bug" || category === "performance" ? "Bug" : "Task",
    priority,
    labels: ["user-feedback", category],
  };
}
