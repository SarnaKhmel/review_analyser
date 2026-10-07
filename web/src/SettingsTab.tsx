import { useEffect, useState } from "react";
import type { HealthResponse } from "../../src/types";
import { getHealth, listModels, testLlm } from "./api";
import { toLlmSettings, type AiSettings } from "./settings";

// Address presets for OpenAI-compatible providers. The model name is always entered by the
// user: provider line-ups change too often to hard-code.
const PRESETS = [
  { name: "Ollama (локально)", baseUrl: "http://localhost:11434/v1" },
  { name: "Groq", baseUrl: "https://api.groq.com/openai/v1" },
  { name: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai" },
  { name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1" },
  { name: "OpenAI", baseUrl: "https://api.openai.com/v1" },
];

type TestState = { status: "idle" | "testing" } | { status: "ok" | "error"; message: string };

type Props = { settings: AiSettings; onChange: (settings: AiSettings) => void };

export function SettingsTab({ settings, onChange }: Props) {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [test, setTest] = useState<TestState>({ status: "idle" });

  useEffect(() => {
    getHealth().then(setHealth, () => setHealth(null));
  }, []);

  // No key on the server (always so in the public deployment): the option is not offered.
  const serverUnavailable = health?.serverLlmConfigured === false;
  useEffect(() => {
    if (serverUnavailable && settings.provider === "server") onChange({ ...settings, provider: "claude" });
  }, [serverUnavailable, settings, onChange]);

  const [models, setModels] = useState<string[]>([]);
  const [modelsNote, setModelsNote] = useState<string | null>(null);

  async function handleLoadModels() {
    setModelsNote("Шукаю моделі й перевіряю найкращу…");
    try {
      const { models: found, recommended } = await listModels(settings.baseUrl, settings.apiKey);
      setModels(found);
      if (recommended) {
        update({ model: recommended });
        setModelsNote(`Обрано автоматично: ${recommended}. Знайдено моделей: ${found.length} — можна обрати іншу.`);
      } else {
        setModelsNote(`Знайдено моделей: ${found.length}, але автоматично підібрати не вдалося. Оберіть вручну.`);
      }
    } catch (e) {
      setModels([]);
      setModelsNote((e as Error).message);
    }
  }

  function update(patch: Partial<AiSettings>) {
    onChange({ ...settings, ...patch });
    setTest({ status: "idle" });
  }

  async function handleTest() {
    setTest({ status: "testing" });
    try {
      const { reply } = await testLlm(toLlmSettings(settings));
      setTest({ status: "ok", message: `Підключення працює. Відповідь моделі: «${reply.slice(0, 80)}»` });
    } catch (e) {
      setTest({ status: "error", message: (e as Error).message });
    }
  }

  return (
    <>
      <section>
        <h2>ШІ для аналізу</h2>
        <p className="muted">
          Ця ШІ класифікує відгуки й відповідає в чаті. Збір відгуків працює без неї.
        </p>

        <div className="options">
          {!serverUnavailable && (
            <label>
              <input
                type="radio"
                name="provider"
                checked={settings.provider === "server"}
                onChange={() => update({ provider: "server" })}
              />
              <span>
                Claude, ключ сервера
                <small className="muted">
                  {health === null ? "Стан сервера невідомий" : `Налаштовано, модель ${health.serverModel}`}
                </small>
              </span>
            </label>
          )}
          <label>
            <input
              type="radio"
              name="provider"
              checked={settings.provider === "claude"}
              onChange={() => update({ provider: "claude" })}
            />
            <span>
              Claude, свій ключ
              <small className="muted">Ключ із console.anthropic.com</small>
            </span>
          </label>
          <label>
            <input
              type="radio"
              name="provider"
              checked={settings.provider === "openai-compatible"}
              onChange={() => update({ provider: "openai-compatible" })}
            />
            <span>
              Інша ШІ (OpenAI-сумісний API)
              <small className="muted">Ollama, Groq, Gemini, OpenRouter, OpenAI тощо</small>
            </span>
          </label>
        </div>
      </section>

      {settings.provider === "claude" && (
        <section className="fields">
          <h2>Claude</h2>
          <label>
            API-ключ
            <input
              type="password"
              value={settings.claudeKey}
              onChange={(e) => update({ claudeKey: e.target.value })}
              placeholder="sk-ant-..."
              autoComplete="off"
            />
          </label>
          <label>
            Модель (необов'язково)
            <input
              type="text"
              value={settings.claudeModel}
              onChange={(e) => update({ claudeModel: e.target.value })}
              placeholder={health?.serverModel ?? "типова модель сервера"}
            />
          </label>
        </section>
      )}

      {settings.provider === "openai-compatible" && (
        <section className="fields">
          <h2>Власна ШІ</h2>
          <div className="presets">
            {PRESETS.map((preset) => (
              <button
                type="button"
                key={preset.name}
                className={settings.baseUrl === preset.baseUrl ? "chip active" : "chip"}
                onClick={() => update({ baseUrl: preset.baseUrl })}
              >
                {preset.name}
              </button>
            ))}
          </div>
          <label>
            Адреса API
            <input
              type="text"
              value={settings.baseUrl}
              onChange={(e) => update({ baseUrl: e.target.value })}
              placeholder="https://.../v1"
            />
          </label>
          <label>
            API-ключ (для локальної Ollama не потрібен)
            <input
              type="password"
              value={settings.apiKey}
              onChange={(e) => update({ apiKey: e.target.value })}
              autoComplete="off"
            />
          </label>
          <label>
            Модель
            <input
              type="text"
              value={settings.model}
              onChange={(e) => update({ model: e.target.value })}
              placeholder="назва моделі в провайдера"
            />
          </label>
          <div>
            <button type="button" className="chip" onClick={handleLoadModels} disabled={!settings.baseUrl.trim()}>
              Підібрати модель автоматично
            </button>
            {modelsNote && <p className="muted">{modelsNote}</p>}
            {models.length > 0 && (
              <div className="presets">
                {models.map((model) => (
                  <button
                    type="button"
                    key={model}
                    className={settings.model === model ? "chip active" : "chip"}
                    aria-pressed={settings.model === model}
                    onClick={() => update({ model })}
                  >
                    {model}
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      <section>
        <button type="button" onClick={handleTest} disabled={test.status === "testing"}>
          {test.status === "testing" ? "Перевіряю…" : "Перевірити підключення"}
        </button>
        {test.status === "ok" && <p className="alert ok">{test.message}</p>}
        {test.status === "error" && <p className="alert error">{test.message}</p>}
        <p className="muted">
          Налаштування зберігаються автоматично в цьому браузері. Ключ лежить у localStorage і
          надсилається на сервер застосунку з кожним запитом, а той передає його лише обраному
          провайдеру. Сервер ключ не зберігає.
        </p>
      </section>
    </>
  );
}
