import path from "node:path";

// Node >= 21 can read .env natively; the file is optional (variables may come from the shell).
try {
  process.loadEnvFile();
} catch {
  // no .env file
}

export const config = {
  port: Number(process.env.PORT ?? 3001),
  model: process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5",
  batchSize: 20,
  /** How many LLM batches run in parallel. */
  concurrency: 4,
  defaultReviewLimit: 100,
  /** Analysis sends every review to the LLM, so its ceiling is lower than for collection. */
  maxAnalyzeLimit: 500,
  maxCollectLimit: 5000,
  /** Used when neither the request nor the link names a language or country. */
  defaultLocale: { lang: "en", country: "us" },
  /** Google Play has no "any language" query, so "all" means one request per language listed here. */
  allLanguages: ["uk", "en", "ru", "pl", "de", "es", "fr", "pt", "it", "tr"],
  /**
   * How many characters of review text the chat may send as context. Other providers get
   * less: their free tiers allow only a few thousand tokens per minute.
   */
  chatContextChars: { claude: 40_000, openAiCompatible: 6_000 },
  fallbackFile: path.resolve("data/sample-reviews.json"),
  cacheFile: path.resolve("data/cache/classifications.json"),
  topicGroupsFile: path.resolve("data/cache/topic-groups.json"),
};
