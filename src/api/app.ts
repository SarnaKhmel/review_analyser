import Anthropic from "@anthropic-ai/sdk";
import express, { type ErrorRequestHandler } from "express";
import { z } from "zod";
import type { AnalysisService } from "../AnalysisService";
import { config } from "../config";
import { UserError } from "../errors";
import { listModels, recommendModel } from "../llm/OpenAiCompatibleClient";
import { ALL_LANGUAGES } from "../types";
import type {
  AnalyzeEvent,
  AnalyzeResponse,
  ChatResponse,
  CollectResponse,
  ErrorResponse,
  HealthResponse,
  LlmModelsResponse,
  LlmTestResponse,
} from "../types";

// The user's own LLM, sent by the browser with each request. Omitted = server default.
const llmSettings = z
  .discriminatedUnion("provider", [
    z.object({
      provider: z.literal("claude"),
      apiKey: z.string("Вкажіть API-ключ Claude").trim().min(1, "Вкажіть API-ключ Claude"),
      model: z.string().trim().optional(),
    }),
    z.object({
      provider: z.literal("openai-compatible"),
      baseUrl: z
        .string("Вкажіть адресу API")
        .trim()
        .regex(/^https?:\/\/\S+$/, "Адреса API має починатися з http:// або https://"),
      model: z.string("Вкажіть назву моделі").trim().min(1, "Вкажіть назву моделі"),
      apiKey: z.string().trim().optional(),
    }),
  ])
  .optional();

const collectBody = z.object({
  url: z.string().trim().min(1, "Вставте посилання на застосунок"),
  limit: reviewLimit(config.maxCollectLimit),
  // Optional: when omitted, taken from `hl`/`gl` in the link, then from the defaults.
  lang: z
    .union([z.literal(ALL_LANGUAGES), twoLetterCode("Мова — дволітерний код (наприклад uk) або all")])
    .optional(),
  country: twoLetterCode("Країна — дволітерний код, наприклад ua").optional(),
});

const analyzeBody = collectBody.extend({
  limit: reviewLimit(config.maxAnalyzeLimit),
  llm: llmSettings,
});
const llmTestBody = z.object({ llm: llmSettings });
const llmModelsBody = z.object({
  baseUrl: z
    .string("Вкажіть адресу API")
    .trim()
    .regex(/^https?:\/\/\S+$/, "Адреса API має починатися з http:// або https://"),
  apiKey: z.string().trim().optional(),
});

function reviewLimit(max: number) {
  const message = `Кількість відгуків — ціле число від 1 до ${max}`;
  return z.number(message).int(message).min(1, message).max(max, message).default(config.defaultReviewLimit);
}

function twoLetterCode(message: string) {
  return z.string(message).trim().toLowerCase().regex(/^[a-z]{2}$/, message);
}

const chatBody = z.object({
  appId: z.string().min(1),
  question: z.string().trim().min(1, "Введіть питання").max(1000),
  llm: llmSettings,
});

export function createApp(service: AnalysisService) {
  const app = express();
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    const result: HealthResponse = {
      ok: true,
      serverLlmConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
      serverModel: config.model,
    };
    res.json(result);
  });

  // Express 5 forwards rejected promises from async handlers to the error middleware.
  // Collection only: no LLM, works without an API key.
  app.post("/api/reviews", async (req, res) => {
    const { url, limit, lang, country } = parseBody(collectBody, req.body);
    const result: CollectResponse = await service.collect(url, limit, { lang, country });
    res.json(result);
  });

  app.post("/api/analyze", async (req, res) => {
    const { url, limit, lang, country, llm } = parseBody(analyzeBody, req.body);
    const result: AnalyzeResponse = await service.analyze(url, limit, { lang, country }, llm);
    res.json(result);
  });

  // Same as /api/analyze, but reports progress: one JSON event per line while the work goes on.
  app.post("/api/analyze/stream", async (req, res) => {
    const { url, limit, lang, country, llm } = parseBody(analyzeBody, req.body);

    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.flushHeaders();
    const send = (event: AnalyzeEvent) => res.write(`${JSON.stringify(event)}\n`);

    try {
      const result = await service.analyze(url, limit, { lang, country }, llm, send);
      send({ type: "done", result });
    } catch (error) {
      // The response has already started, so the failure travels as an event, not a status code.
      send({ type: "error", error: describeError(error)[1] });
    }
    res.end();
  });

  app.post("/api/chat", async (req, res) => {
    const { appId, question, llm } = parseBody(chatBody, req.body);
    const result: ChatResponse = { answer: await service.chat(appId, question, llm) };
    res.json(result);
  });

  app.post("/api/llm/test", async (req, res) => {
    const { llm } = parseBody(llmTestBody, req.body);
    const result: LlmTestResponse = { reply: await service.testLlm(llm) };
    res.json(result);
  });

  app.post("/api/llm/models", async (req, res) => {
    const { baseUrl, apiKey } = parseBody(llmModelsBody, req.body);
    const models = await listModels(baseUrl, apiKey || undefined);
    const result: LlmModelsResponse = {
      models,
      recommended: await recommendModel(baseUrl, apiKey || undefined, models),
    };
    res.json(result);
  });

  app.use(errorHandler);
  return app;
}

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    throw new UserError(parsed.error.issues[0]?.message ?? "Некоректний запит");
  }
  return parsed.data;
}

/** Turns any failure into `{ error }` with a message the UI can show as is. */
const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const [status, message] = describeError(error);
  if (!(error instanceof UserError) && status >= 500) console.error(error);
  const body: ErrorResponse = { error: message };
  res.status(status).json(body);
};

function describeError(error: unknown): [number, string] {
  if (error instanceof UserError) return [error.status, error.message];
  if (error instanceof SyntaxError) return [400, "Некоректний JSON у запиті"];

  if (error instanceof Anthropic.AuthenticationError) {
    return [502, "Claude API відхилив ключ: перевірте API-ключ Claude"];
  }
  if (error instanceof Anthropic.RateLimitError) {
    return [502, "Перевищено ліміт запитів до Claude API, спробуйте за хвилину"];
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return [502, "Немає зв'язку з Claude API"];
  }
  if (error instanceof Anthropic.APIError) {
    return [502, `Помилка Claude API: ${error.message}`];
  }
  return [500, "Внутрішня помилка сервера"];
}
