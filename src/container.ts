import { AnalysisService } from "./AnalysisService";
import { config } from "./config";
import { ClassificationCache } from "./llm/ClassificationCache";
import { createLlm } from "./llm/createLlm";
import { ReviewClassifier } from "./llm/ReviewClassifier";
import { TopicGrouper } from "./llm/TopicGrouper";
import { FileSource } from "./sources/FileSource";
import { GooglePlaySource } from "./sources/GooglePlaySource";
import { MergedSource } from "./sources/MergedSource";
import type { ReviewSource } from "./sources/ReviewSource";
import { ALL_LANGUAGES, type Locale } from "./types";

/** Composition root: the only place that knows which concrete classes are used. */
export function createAnalysisService(): AnalysisService {
  const cache = new ClassificationCache(config.cacheFile);

  return new AnalysisService({
    createLlm,
    createClassifier: (llm, cacheScope) =>
      new ReviewClassifier(llm, cache, {
        batchSize: config.batchSize,
        concurrency: config.concurrency,
        cacheScope,
      }),
    createTopicGrouper: (llm, cacheScope) => new TopicGrouper(llm, config.topicGroupsFile, cacheScope),
    createSource: createGooglePlaySource,
    fallbackSource: new FileSource(config.fallbackFile),
    defaultLocale: config.defaultLocale,
  });
}

function createGooglePlaySource(appId: string, limit: number, locale: Locale): ReviewSource {
  if (locale.lang !== ALL_LANGUAGES) return new GooglePlaySource(appId, limit, locale);

  const perLanguage = config.allLanguages.map(
    (lang) => new GooglePlaySource(appId, limit, { ...locale, lang }),
  );
  return new MergedSource(perLanguage, limit);
}
