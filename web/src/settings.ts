import type { LlmSettings } from "../../src/types";

/** What the settings form holds. "server" = use the key configured on the server. */
export type AiSettings = {
  provider: "server" | "claude" | "openai-compatible";
  claudeKey: string;
  claudeModel: string;
  baseUrl: string;
  apiKey: string;
  model: string;
};

export const DEFAULT_SETTINGS: AiSettings = {
  provider: "server",
  claudeKey: "",
  claudeModel: "",
  baseUrl: "",
  apiKey: "",
  model: "",
};

const STORAGE_KEY = "review-insights:ai-settings";

// localStorage can be unavailable (private mode, blocked site data): the app must still work.
export function loadSettings(): AiSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AiSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // The settings then live only until the page is reloaded.
  }
}

/** Converts the form into what the API expects; undefined means "use the server default". */
export function toLlmSettings(settings: AiSettings): LlmSettings | undefined {
  if (settings.provider === "claude") {
    return {
      provider: "claude",
      apiKey: settings.claudeKey.trim(),
      model: settings.claudeModel.trim() || undefined,
    };
  }
  if (settings.provider === "openai-compatible") {
    return {
      provider: "openai-compatible",
      baseUrl: settings.baseUrl.trim(),
      model: settings.model.trim(),
      apiKey: settings.apiKey.trim() || undefined,
    };
  }
  return undefined;
}

export function describeSettings(settings: AiSettings): string {
  if (settings.provider === "claude") return `Claude, свій ключ${settings.claudeModel ? ` (${settings.claudeModel})` : ""}`;
  if (settings.provider === "openai-compatible") return settings.model || "власна ШІ";
  return "Claude, ключ сервера";
}
