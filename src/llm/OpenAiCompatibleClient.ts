import { UserError } from "../errors";
import type { Review } from "../types";
import type { LlmClient } from "./LlmClient";
import {
  buildClassifyMessage,
  buildGroupTopicsMessage,
  CLASSIFY_SYSTEM_PROMPT,
  GROUP_TOPICS_SYSTEM_PROMPT,
  type TopicItem,
} from "./prompts";

// Local models on a CPU can take minutes per batch.
const TIMEOUT_MS = 5 * 60 * 1000;

const MAX_RATE_LIMIT_RETRIES = 5;
const JSON_MAX_OUTPUT_TOKENS = 6000;
const DEFAULT_RETRY_DELAY_MS = 20_000;
const MAX_RETRY_DELAY_MS = 65_000;

// These providers differ in how well they support JSON schemas, so the shape is described
// in the prompt and only "valid JSON" is requested from the API. The classifier validates
// the result with Zod either way.
const JSON_ONLY = "\nRespond with a single JSON object and nothing else, in exactly this shape:\n";
const CLASSIFY_SHAPE = `{"results":[{"index":0,"sentiment":"negative","category":"bug","severity":"high","intensity":"strong","topic":"вилітає при запуску"}]}`;
const GROUP_TOPICS_SHAPE = `{"groups":[{"label":"вилітає при запуску","indexes":[0,3]}]}`;

type ChatCompletion = { choices?: { message?: { content?: string | null } }[] };

/**
 * Talks to any API that implements the OpenAI chat-completions protocol:
 * OpenAI, Groq, Gemini, OpenRouter, a local Ollama, and so on.
 */
export class OpenAiCompatibleClient implements LlmClient {
  constructor(
    private readonly baseUrl: string,
    private readonly model: string,
    private readonly apiKey?: string,
  ) {}

  async classifyBatch(reviews: Review[]): Promise<unknown> {
    return this.completeJson(
      CLASSIFY_SYSTEM_PROMPT + JSON_ONLY + CLASSIFY_SHAPE,
      buildClassifyMessage(reviews),
    );
  }

  async groupTopics(items: TopicItem[]): Promise<unknown> {
    return this.completeJson(
      GROUP_TOPICS_SYSTEM_PROMPT + JSON_ONLY + GROUP_TOPICS_SHAPE,
      buildGroupTopicsMessage(items),
    );
  }

  private async completeJson(system: string, user: string): Promise<unknown> {
    let content: string;
    try {
      content = await this.complete(system, user, {
        response_format: { type: "json_object" },
        // Reasoning models spend output tokens on thinking first; with a small default limit
        // they can run out before writing the JSON.
        max_completion_tokens: JSON_MAX_OUTPUT_TOKENS,
      });
    } catch (error) {
      // 400 in JSON mode: the provider rejected the model's own output as invalid JSON (Groq does
      // this now and then), or it does not know one of the parameters above. Ask again as a
      // plain request; the prompt still demands JSON, and the caller validates whatever comes back.
      if (!(error instanceof ProviderError) || error.providerStatus !== 400) throw error;
      content = await this.complete(system, user);
    }
    return parseJson(content);
  }

  async answer(system: string, question: string): Promise<string> {
    return (await this.complete(system, question)).trim();
  }

  private async complete(system: string, user: string, extra: object = {}): Promise<string> {
    const body = JSON.stringify({
      model: this.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      ...extra,
    });

    // Free tiers have tight per-minute limits: on 429 wait as long as the provider asks and retry.
    let response = await this.post(body);
    for (let retry = 0; response.status === 429 && retry < MAX_RATE_LIMIT_RETRIES; retry++) {
      await sleep(retryDelayMs(response));
      response = await this.post(body);
    }

    if (!response.ok) throw new ProviderError(response.status, await response.text());

    const data = (await response.json().catch(() => null)) as ChatCompletion | null;
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new UserError("ШІ повернула відповідь у неочікуваному форматі. Перевірте адресу API.", 502);
    }
    return content;
  }

  private post(body: string): Promise<Response> {
    return request(`${this.baseUrl}/chat/completions`, this.apiKey, { method: "POST", body });
  }
}

/** Names of the models the provider offers, for the settings screen. */
export async function listModels(baseUrl: string, apiKey?: string): Promise<string[]> {
  const response = await request(`${baseUrl.replace(/\/+$/, "")}/models`, apiKey, { method: "GET" });
  if (!response.ok) throw new ProviderError(response.status, await response.text());

  const data = (await response.json().catch(() => null)) as { data?: { id?: unknown }[] } | null;
  if (!Array.isArray(data?.data)) {
    throw new UserError("Провайдер не віддав список моделей. Введіть назву моделі вручну.", 502);
  }
  return data.data
    .map((model) => model.id)
    .filter((id): id is string => typeof id === "string")
    .sort();
}

// Models that are clearly not for text chat: speech, embeddings, moderation, images.
const NOT_CHAT = /whisper|tts|speech|audio|orpheus|embed|rerank|guard|moderation|image|dall-e/i;
const MAX_PROBES = 3;

/**
 * Picks a model automatically: drops non-chat models, puts the largest first (by the
 * "120b"-style size in the name) and returns the first one that really answers.
 */
export async function recommendModel(
  baseUrl: string,
  apiKey: string | undefined,
  models: string[],
): Promise<string | null> {
  const candidates = models
    .filter((model) => !NOT_CHAT.test(model))
    .sort((a, b) => sizeInName(b) - sizeInName(a))
    .slice(0, MAX_PROBES);

  for (const model of candidates) {
    try {
      await new OpenAiCompatibleClient(baseUrl.replace(/\/+$/, ""), model, apiKey).answer(
        "You are a connection test. Reply with the single word: OK",
        "ping",
      );
      return model;
    } catch {
      // Not usable with this key: try the next candidate.
    }
  }
  return null;
}

/** "openai/gpt-oss-120b" → 120. Names without a size count as 0. */
function sizeInName(model: string): number {
  const match = /(\d+(?:\.\d+)?)b\b/i.exec(model);
  return match ? Number(match[1]) : 0;
}

async function request(url: string, apiKey: string | undefined, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        // Local servers such as Ollama need no key.
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    throw new UserError(
      timedOut
        ? `ШІ не відповіла за ${TIMEOUT_MS / 60000} хв (${url})`
        : `Не вдалося з'єднатися з ШІ за адресою ${url}. Перевірте адресу API.`,
      502,
    );
  }
}

/** The provider says how long to wait in the Retry-After header (seconds). */
function retryDelayMs(response: Response): number {
  const seconds = Number(response.headers.get("retry-after"));
  const delay = Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : DEFAULT_RETRY_DELAY_MS;
  return Math.min(delay, MAX_RETRY_DELAY_MS);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The provider answered with an HTTP error. Keeps the status so callers can react to it. */
class ProviderError extends UserError {
  constructor(
    readonly providerStatus: number,
    body: string,
  ) {
    super(describeFailure(providerStatus, body), 502);
  }
}

function describeFailure(status: number, body: string): string {
  if (status === 401 || status === 403) return "ШІ-провайдер відхилив ключ: перевірте API-ключ";
  if (status === 404) return "ШІ-провайдер не знайшов модель або адресу: перевірте назву моделі й адресу API";
  if (status === 413) return "Запит завеликий для ліміту цього ШІ-провайдера: зменште кількість відгуків";
  if (status === 429) return `Перевищено ліміт запитів до ШІ-провайдера, спробуйте пізніше. ${body.slice(0, 200)}`;
  return `ШІ-провайдер відповів помилкою ${status}: ${body.slice(0, 200)}`;
}

/** Invalid JSON becomes null, which the classifier treats as invalid output (retry, then fallback). */
export function parseJson(content: string): unknown {
  // Some models wrap JSON in a Markdown code fence despite the instruction.
  const text = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
