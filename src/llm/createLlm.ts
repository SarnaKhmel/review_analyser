import { config } from "../config";
import type { LlmSettings } from "../types";
import { ClaudeClient } from "./ClaudeClient";
import type { LlmClient } from "./LlmClient";
import { OpenAiCompatibleClient } from "./OpenAiCompatibleClient";

export type ResolvedLlm = {
  llm: LlmClient;
  /** Identifies the model: classifications of one model are not served from the cache for another. */
  cacheScope: string;
  /** Budget for the review sample in the chat context. */
  contextChars: number;
};

/** Builds the LLM client for one request. */
export function createLlm(settings?: LlmSettings): ResolvedLlm {
  if (settings?.provider === "openai-compatible") {
    const baseUrl = settings.baseUrl.replace(/\/+$/, "");
    return {
      llm: new OpenAiCompatibleClient(baseUrl, settings.model, settings.apiKey),
      cacheScope: `${baseUrl}|${settings.model}`,
      contextChars: config.chatContextChars.openAiCompatible,
    };
  }

  // The user's own Claude key, or (no settings) the server key from .env.
  const model = settings?.model || config.model;
  return {
    llm: new ClaudeClient(model, settings?.apiKey),
    cacheScope: `claude|${model}`,
    contextChars: config.chatContextChars.claude,
  };
}
