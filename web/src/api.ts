import type {
  AnalyzeEvent,
  AnalyzeProgress,
  AnalyzeResponse,
  ChatResponse,
  CollectResponse,
  ErrorResponse,
  HealthResponse,
  LlmModelsResponse,
  LlmSettings,
  LlmTestResponse,
} from "../../src/types";
import type { LocaleChoice } from "./LocaleFields";

async function post<T>(path: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Сервер недоступний. Перевірте, чи запущено API.");
  }

  // The dev proxy answers with a non-JSON body when the API process is down.
  const data = (await response.json().catch(() => null)) as T | ErrorResponse | null;
  if (!response.ok || data === null) {
    const message = data && typeof data === "object" && "error" in data ? data.error : null;
    throw new Error(message ?? `Помилка сервера (${response.status})`);
  }
  return data as T;
}

// An empty choice means "auto": the field is omitted and the server decides.
const localeParams = ({ lang }: LocaleChoice) => ({ lang: lang || undefined });

/**
 * Runs the analysis and reports progress while it goes on. The server answers with one JSON
 * event per line. `llm` is the user's own AI from the settings tab; undefined = server default.
 */
export async function analyze(
  url: string,
  limit: number,
  locale: LocaleChoice,
  llm: LlmSettings | undefined,
  onProgress: (event: AnalyzeProgress) => void,
): Promise<AnalyzeResponse> {
  let response: Response;
  try {
    response = await fetch("/api/analyze/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, limit, ...localeParams(locale), llm }),
    });
  } catch {
    throw new Error("Сервер недоступний. Перевірте, чи запущено API.");
  }
  if (!response.ok || !response.body) {
    const data = (await response.json().catch(() => null)) as ErrorResponse | null;
    throw new Error(data?.error ?? `Помилка сервера (${response.status})`);
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;

    // A chunk can end in the middle of a line: keep the unfinished tail for the next chunk.
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as AnalyzeEvent;
      if (event.type === "done") return event.result;
      if (event.type === "error") throw new Error(event.error);
      onProgress(event);
    }
  }
  throw new Error("З'єднання із сервером обірвалося до завершення аналізу. Запустіть ще раз — готове візьметься з кешу.");
}

export const collect = (url: string, limit: number, locale: LocaleChoice) =>
  post<CollectResponse>("/api/reviews", { url, limit, ...localeParams(locale) });

export const chat = (appId: string, question: string, llm?: LlmSettings) =>
  post<ChatResponse>("/api/chat", { appId, question, llm });

export const testLlm = (llm?: LlmSettings) => post<LlmTestResponse>("/api/llm/test", { llm });

export const listModels = (baseUrl: string, apiKey: string) =>
  post<LlmModelsResponse>("/api/llm/models", { baseUrl, apiKey });

export async function getHealth(): Promise<HealthResponse> {
  const response = await fetch("/api/health");
  if (!response.ok) throw new Error("Сервер недоступний");
  return response.json();
}
