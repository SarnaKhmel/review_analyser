import { aggregate } from "./analytics/aggregate";
import { UserError } from "./errors";
import { answerQuestion } from "./llm/chat";
import type { ResolvedLlm } from "./llm/createLlm";
import type { LlmClient } from "./llm/LlmClient";
import type { ReviewClassifier } from "./llm/ReviewClassifier";
import type { TopicGrouper } from "./llm/TopicGrouper";
import { extractAppId } from "./sources/extractAppId";
import { extractLocale } from "./sources/extractLocale";
import { fetchWithFallback } from "./sources/fetchWithFallback";
import type { ReviewSource } from "./sources/ReviewSource";
import type {
  Analytics,
  AnalyzeProgress,
  AnalyzeResponse,
  ClassifiedReview,
  CollectResponse,
  LlmSettings,
  Locale,
} from "./types";

export type StoredAnalysis = { reviews: ClassifiedReview[]; analytics: Analytics };

/** Keeps the latest analysis of every app, so the chat can answer questions about it. */
export type AnalysisStore = {
  get(appId: string): Promise<StoredAnalysis | undefined>;
  set(appId: string, analysis: StoredAnalysis): Promise<void>;
};

type Dependencies = {
  /** Picks the LLM for a request: the user's own, or the server default when no settings are sent. */
  createLlm: (settings?: LlmSettings) => ResolvedLlm;
  createClassifier: (llm: LlmClient, cacheScope: string) => ReviewClassifier;
  createTopicGrouper: (llm: LlmClient, cacheScope: string) => TopicGrouper;
  /** Factory, because the primary source depends on the parameters of each request. */
  createSource: (appId: string, limit: number, locale: Locale) => ReviewSource;
  fallbackSource: ReviewSource;
  defaultLocale: Locale;
  /** Omitted = in memory, until the server restarts. */
  analyses?: AnalysisStore;
};

/** The use cases of the app: collect → classify → aggregate, and chat over the result. */
export class AnalysisService {
  private readonly analyses: AnalysisStore;

  constructor(private readonly deps: Dependencies) {
    this.analyses = deps.analyses ?? inMemoryAnalyses();
  }

  /**
   * Collection only: no LLM involved, works without an API key.
   * Locale priority: explicit request → `hl`/`gl` in the link → default.
   */
  async collect(urlOrAppId: string, limit: number, requested: Partial<Locale> = {}): Promise<CollectResponse> {
    let appId: string;
    try {
      appId = extractAppId(urlOrAppId);
    } catch (error) {
      throw new UserError((error as Error).message);
    }

    const fromLink = extractLocale(urlOrAppId);
    const locale: Locale = {
      lang: requested.lang ?? fromLink.lang ?? this.deps.defaultLocale.lang,
      country: requested.country ?? fromLink.country ?? this.deps.defaultLocale.country,
    };

    const fetched = await fetchWithFallback(
      this.deps.createSource(appId, limit, locale),
      this.deps.fallbackSource,
    );
    return { appId, locale, ...fetched };
  }

  async analyze(
    urlOrAppId: string,
    limit: number,
    requested: Partial<Locale> = {},
    llmSettings?: LlmSettings,
    onProgress?: (event: AnalyzeProgress) => void,
    /** Aborted when the caller no longer needs the result: no further LLM requests are started. */
    signal?: AbortSignal,
  ): Promise<AnalyzeResponse> {
    // Resolved first: a misconfigured LLM should fail before any reviews are downloaded.
    const { llm, cacheScope } = this.deps.createLlm(llmSettings);
    const { appId, locale, ...fetched } = await this.collect(urlOrAppId, limit, requested);
    signal?.throwIfAborted();
    const total = fetched.reviews.length;
    onProgress?.({ type: "collected", appId, source: fetched.source, warning: fetched.warning, total });

    const classified = await this.deps
      .createClassifier(llm, cacheScope)
      .classify(
        fetched.reviews,
        (reviews) => onProgress?.({ type: "progress", appId, done: reviews.length, total, reviews }),
        signal,
      );
    const { stats } = classified;

    // Second pass: the same problem is often worded differently, merge such topics.
    onProgress?.({ type: "grouping", appId, total, reviews: classified.reviews });
    const grouped = await this.deps.createTopicGrouper(llm, cacheScope).group(classified.reviews, signal);
    stats.llmCalls += grouped.llmCalls;

    const reviews = grouped.reviews;
    const analytics = aggregate(appId, reviews);

    await this.analyses.set(appId, { reviews, analytics });
    return { appId, locale, source: fetched.source, warning: fetched.warning, stats, analytics, reviews };
  }

  async chat(appId: string, question: string, llmSettings?: LlmSettings): Promise<string> {
    const analysis = await this.analyses.get(appId);
    if (!analysis) {
      throw new UserError("Спершу проаналізуйте застосунок, а потім ставте питання", 404);
    }
    const { llm, contextChars } = this.deps.createLlm(llmSettings);
    return answerQuestion(llm, question, analysis.reviews, analysis.analytics, contextChars);
  }

  /** One tiny request, so the settings screen can tell a working connection from a broken one. */
  async testLlm(llmSettings?: LlmSettings): Promise<string> {
    const { llm } = this.deps.createLlm(llmSettings);
    return llm.answer("You are a connection test. Reply with the single word: OK", "ping");
  }
}

function inMemoryAnalyses(): AnalysisStore {
  const analyses = new Map<string, StoredAnalysis>();
  return {
    get: async (appId) => analyses.get(appId),
    set: async (appId, analysis) => void analyses.set(appId, analysis),
  };
}
