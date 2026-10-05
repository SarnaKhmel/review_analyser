// Collection only, no LLM: npm run collect -- <Google Play url | appId> [limit] [lang] [country]
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "./config";
import { createAnalysisService } from "./container";

const [input, limitArg, lang, country] = process.argv.slice(2);
if (!input) {
  console.error("Використання: npm run collect -- <посилання Google Play | appId> [кількість відгуків] [мова] [країна]");
  process.exit(1);
}

const service = createAnalysisService();
const { appId, locale, reviews, source, warning } = await service.collect(
  input,
  Number(limitArg) || config.defaultReviewLimit,
  { lang, country },
);

const file = path.resolve("data/reviews", `${appId}.json`);
await mkdir(path.dirname(file), { recursive: true });
await writeFile(file, JSON.stringify(reviews, null, 2));

console.log(`\nЗастосунок: ${appId} (джерело: ${source}, мова: ${locale.lang}, країна: ${locale.country})`);
if (warning) console.log(`Увага: ${warning}`);
console.log(`Зібрано відгуків: ${reviews.length} → ${file}`);

console.log("\nРозподіл за зірками");
console.table(
  Object.fromEntries(
    [1, 2, 3, 4, 5].map((star) => [`${star}★`, reviews.filter((review) => review.score === star).length]),
  ),
);

console.log("Останні відгуки");
for (const review of reviews.slice(0, 5)) {
  console.log(`  ${review.score}★ ${review.date.slice(0, 10)}  ${review.text.slice(0, 120)}`);
}
