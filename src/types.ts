// Domain types shared by every layer (and by the web client). No runtime dependencies.

export const SENTIMENTS = ["positive", "neutral", "negative"] as const;
export const CATEGORIES = [
  "bug",
  "pricing",
  "ux",
  "performance",
  "feature",
  "support",
  "praise",
  "other",
] as const;
export const SEVERITIES = ["low", "medium", "high"] as const;
/** How strongly the emotion is expressed. With sentiment it gives the mood: furious … delighted. */
export const INTENSITIES = ["mild", "moderate", "strong"] as const;

export type Sentiment = (typeof SENTIMENTS)[number];
export type Category = (typeof CATEGORIES)[number];
export type Severity = (typeof SEVERITIES)[number];
export type Intensity = (typeof INTENSITIES)[number];

export type Review = { id: string; text: string; score: number; date: string };

export type Classification = {
  sentiment: Sentiment;
  category: Category;
  severity: Severity;
  /** Strength of the emotion: negative + strong = furious, positive + strong = delighted. */
  intensity: Intensity;
  /**
   * Short free-form label of what exactly the review is about ("вилітає при запуску",
   * "немає темної теми"). Finer than `category`; empty when classification fell back.
   */
  topic: string;
};

export type ClassifiedReview = Review & Classification;

export type ClassifyStats = {
  total: number;
  fromCache: number;
  fromLlm: number;
  fallbacks: number;
  llmCalls: number;
};

export type CategoryStat = { category: Category; count: number; share: number };

export type TicketPayload = {
  summary: string;
  description: string;
  issueType: "Bug" | "Task";
  priority: "High" | "Medium" | "Low";
  labels: string[];
};

/** One specific pain: the reviews of one category that share a topic. */
export type TopProblem = {
  category: Category;
  /** Empty when the reviews have no topic (classification fell back). */
  topic: string;
  count: number;
  /** Sum of severity weights (high=3, medium=2, low=1) — the ranking key. */
  weight: number;
  bySeverity: Record<Severity, number>;
  /** Full review texts, most severe first: enough to write a ticket from. */
  examples: Review[];
  ticket: TicketPayload;
};

export type Analytics = {
  total: number;
  averageScore: number;
  /** Rows: sentiment. Columns: stars 1..5 (index 0 = 1 star). */
  sentimentByScore: Record<Sentiment, number[]>;
  categories: CategoryStat[];
  topProblems: TopProblem[];
};

export type SourceName = "google-play" | "file";

/** `lang` value that means "every supported language, merged". */
export const ALL_LANGUAGES = "all";

/**
 * Which storefront to read: review language (ISO 639-1, or "all") and country (ISO 3166-1),
 * lowercase.
 */
export type Locale = { lang: string; country: string };

export type AnalyzeResponse = {
  appId: string;
  locale: Locale;
  source: SourceName;
  /** Set when the primary source failed and the local file was used instead. */
  warning?: string;
  stats: ClassifyStats;
  analytics: Analytics;
  /** Every classified review, so the client can filter and re-aggregate without the server. */
  reviews: ClassifiedReview[];
};

/** Sent while an analysis is running, so the UI can show progress and partial results. */
export type AnalyzeProgress =
  | { type: "collected"; appId: string; source: SourceName; warning?: string; total: number }
  /** `reviews` are the ones classified so far (`done` of `total`). */
  | { type: "progress"; appId: string; done: number; total: number; reviews: ClassifiedReview[] }
  /** Classification is finished; similar topics are being merged. */
  | { type: "grouping"; appId: string; total: number; reviews: ClassifiedReview[] };

/** One line of the /api/analyze/stream response. */
export type AnalyzeEvent =
  | AnalyzeProgress
  | { type: "done"; result: AnalyzeResponse }
  | { type: "error"; error: string };

export type CollectResponse = {
  appId: string;
  locale: Locale;
  source: SourceName;
  warning?: string;
  reviews: Review[];
};

/**
 * An LLM chosen by the user in the browser. When a request carries no settings,
 * the server uses its own Claude key from .env.
 */
export type LlmSettings =
  | { provider: "claude"; apiKey: string; model?: string }
  /** Any API that speaks the OpenAI chat-completions protocol: OpenAI, Groq, Gemini, Ollama… */
  | { provider: "openai-compatible"; baseUrl: string; model: string; apiKey?: string };

export type HealthResponse = { ok: true; serverLlmConfigured: boolean; serverModel: string };
export type LlmTestResponse = { reply: string };
/** `recommended` is the model picked automatically, or null when none of the candidates answered. */
export type LlmModelsResponse = { models: string[]; recommended: string | null };

export type ChatResponse = { answer: string };
export type ErrorResponse = { error: string };
