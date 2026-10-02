import { config } from "../config";
import { createAnalysisService } from "../container";
import { createApp } from "./app";

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn("ANTHROPIC_API_KEY не задано — аналіз і чат повертатимуть помилку");
}

createApp(createAnalysisService()).listen(config.port, () => {
  console.log(`API: http://localhost:${config.port}`);
});
