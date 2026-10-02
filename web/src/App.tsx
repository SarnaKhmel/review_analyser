import { useState } from "react";
import type { AnalyzeProgress, AnalyzeResponse, CollectResponse } from "../../src/types";
import { analyze } from "./api";
import { CollectChatTab, type ChatMessage } from "./CollectChatTab";
import type { LocaleChoice } from "./LocaleFields";
import { ReviewsTab } from "./ReviewsTab";
import { SentimentTab } from "./SentimentTab";
import { describeSettings, loadSettings, saveSettings, toLlmSettings, type AiSettings } from "./settings";
import { SettingsTab } from "./SettingsTab";

/** State of the current analysis run. `progress` is the latest event from the server. */
export type RunState =
  | { status: "idle" }
  | { status: "running"; progress: AnalyzeProgress | null }
  | { status: "error"; message: string };

type Tab = "collect" | "reviews" | "sentiment" | "settings";

export function App() {
  const [tab, setTab] = useState<Tab>("collect");
  // State lives here so that switching tabs does not lose the link, the reviews, the analysis or the chat.
  const [url, setUrl] = useState("");
  const [locale, setLocale] = useState<LocaleChoice>({ lang: "" });
  const [collected, setCollected] = useState<CollectResponse | null>(null);
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const [settings, setSettings] = useState<AiSettings>(loadSettings);

  function handleSettings(next: AiSettings) {
    setSettings(next);
    saveSettings(next);
  }

  // The run lives here, not in the tab: it must survive switching tabs.
  const [run, setRun] = useState<RunState>({ status: "idle" });

  async function handleAnalyze(limit: number) {
    setRun({ status: "running", progress: null });
    try {
      const result = await analyze(url, limit, locale, toLlmSettings(settings), (progress) =>
        setRun({ status: "running", progress }),
      );
      setAnalysis(result);
      setMessages([]);
      setRun({ status: "idle" });
    } catch (e) {
      setRun({ status: "error", message: (e as Error).message });
    }
  }

  return (
    <main>
      <header>
        <h1>Review Insights</h1>
        <p className="muted">Аналіз відгуків застосунків Google Play</p>
      </header>

      <nav role="tablist">
        <button role="tab" aria-selected={tab === "collect"} onClick={() => setTab("collect")}>
          Збір + чат
        </button>
        <button role="tab" aria-selected={tab === "reviews"} onClick={() => setTab("reviews")}>
          Відгуки
        </button>
        <button role="tab" aria-selected={tab === "sentiment"} onClick={() => setTab("sentiment")}>
          Аналітика
        </button>
        <button role="tab" aria-selected={tab === "settings"} onClick={() => setTab("settings")}>
          Налаштування
        </button>
      </nav>

      {/* Every tab stays mounted and is only hidden, so nothing typed or loaded in it is lost. */}
      <div hidden={tab !== "collect"}>
        <CollectChatTab
          url={url}
          onUrl={setUrl}
          locale={locale}
          onLocale={setLocale}
          analysis={analysis}
          run={run}
          onAnalyze={handleAnalyze}
          llm={toLlmSettings(settings)}
          messages={messages}
          onMessages={setMessages}
          onShowAnalytics={() => setTab("sentiment")}
          llmName={describeSettings(settings)}
          onShowSettings={() => setTab("settings")}
        />
      </div>
      <div hidden={tab !== "reviews"}>
        <ReviewsTab
          url={url}
          onUrl={setUrl}
          locale={locale}
          onLocale={setLocale}
          collected={collected}
          onCollected={setCollected}
        />
      </div>
      <div hidden={tab !== "sentiment"}>
        <SentimentTab analysis={analysis} run={run} />
      </div>
      <div hidden={tab !== "settings"}>
        <SettingsTab settings={settings} onChange={handleSettings} />
      </div>

      <footer>
        Review Insights v{__APP_VERSION__} · Oleksa Sarnatskyi ·{" "}
        <a href="https://github.com/SarnaKhmel" target="_blank" rel="noreferrer">
          github.com/SarnaKhmel
        </a>
      </footer>
    </main>
  );
}
