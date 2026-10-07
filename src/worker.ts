import { httpServerHandler } from "cloudflare:node";
import { env } from "cloudflare:workers";
import sampleReviews from "../data/sample-reviews.json";
import { createApp } from "./api/app";
import { config } from "./config";
import { createAnalysisService } from "./container";
import { StaticSource } from "./sources/StaticSource";
import { KvStore } from "./storage/TextStore";
import type { StoredAnalysis } from "./AnalysisService";

// Cloudflare Workers entry: the same Express app, with KV in place of the local disk.
// An isolate can be recycled between requests, so nothing may live only in memory.
const service = createAnalysisService({
  cacheStore: new KvStore(env.CACHE, "classifications"),
  topicGroupsStore: new KvStore(env.CACHE, "topic-groups"),
  fallbackSource: new StaticSource(sampleReviews),
  analyses: {
    async get(appId) {
      const stored = await env.CACHE.get(`analysis:${appId}`);
      return stored ? (JSON.parse(stored) as StoredAnalysis) : undefined;
    },
    set: (appId, analysis) => env.CACHE.put(`analysis:${appId}`, JSON.stringify(analysis)),
  },
});

createApp(service).listen(config.port);

export default httpServerHandler({ port: config.port });
