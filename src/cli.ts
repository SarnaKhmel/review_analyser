// Console entry point: npm run cli -- <Google Play url | appId> [limit] [lang] [country]
import { config } from "./config";
import { createAnalysisService } from "./container";
import { SENTIMENTS } from "./types";

const [input, limitArg, lang, country] = process.argv.slice(2);
if (!input) {
  console.error("Використання: npm run cli -- <посилання Google Play | appId> [кількість відгуків] [мова] [країна]");
  process.exit(1);
}

const service = createAnalysisService();
const result = await service.analyze(input, Number(limitArg) || config.defaultReviewLimit, { lang, country });
const { analytics, stats } = result;

console.log(
  `\nЗастосунок: ${result.appId} (джерело: ${result.source}, мова: ${result.locale.lang}, країна: ${result.locale.country})`,
);
if (result.warning) console.log(`Увага: ${result.warning}`);
console.log(
  `Відгуків: ${stats.total} | з кешу: ${stats.fromCache} | через LLM: ${stats.fromLlm} ` +
    `| fallback: ${stats.fallbacks} | LLM-викликів: ${stats.llmCalls}`,
);

console.log("\nТональність × зірки");
console.table(
  Object.fromEntries(
    SENTIMENTS.map((sentiment) => [
      sentiment,
      Object.fromEntries(analytics.sentimentByScore[sentiment].map((count, i) => [`${i + 1}★`, count])),
    ]),
  ),
);

console.log("Категорії");
console.table(
  analytics.categories.map(({ category, count, share }) => ({
    category,
    count,
    share: `${Math.round(share * 100)}%`,
  })),
);

console.log("Топ-проблеми");
for (const problem of analytics.topProblems) {
  console.log(`- ${problem.category}: ${problem.topic || "—"} — ${problem.count} (вага ${problem.weight})`);
  for (const example of problem.examples.slice(0, 2)) console.log(`    «${example.text.slice(0, 160)}»`);
}

