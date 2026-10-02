import { useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import type { AnalyzeResponse, LlmSettings } from "../../src/types";
import type { RunState } from "./App";
import { chat } from "./api";
import { languageName, LocaleFields, type LocaleChoice } from "./LocaleFields";

// Keep in sync with maxAnalyzeLimit in src/config.ts.
const MAX_REVIEWS = 500;

export type ChatMessage = { role: "user" | "assistant" | "error"; text: string };

type Props = {
  url: string;
  onUrl: (url: string) => void;
  locale: LocaleChoice;
  onLocale: (locale: LocaleChoice) => void;
  analysis: AnalyzeResponse | null;
  run: RunState;
  onAnalyze: (limit: number) => void;
  llm: LlmSettings | undefined;
  messages: ChatMessage[];
  onMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  onShowAnalytics: () => void;
  llmName: string;
  onShowSettings: () => void;
};

export function CollectChatTab({
  url,
  onUrl,
  locale,
  onLocale,
  analysis,
  run,
  onAnalyze,
  messages,
  onMessages,
  onShowAnalytics,
  llm,
  llmName,
  onShowSettings,
}: Props) {
  const [limit, setLimit] = useState(100);
  const analyzing = run.status === "running";

  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);

  function handleAnalyze(event: FormEvent) {
    event.preventDefault();
    onAnalyze(limit);
  }

  async function handleAsk(event: FormEvent) {
    event.preventDefault();
    const text = question.trim();
    if (!analysis || !text) return;

    setQuestion("");
    setAsking(true);
    onMessages((previous) => [...previous, { role: "user", text }]);
    try {
      const { answer } = await chat(analysis.appId, text, llm);
      onMessages((previous) => [...previous, { role: "assistant", text: answer }]);
    } catch (e) {
      onMessages((previous) => [...previous, { role: "error", text: (e as Error).message }]);
    } finally {
      setAsking(false);
    }
  }

  return (
    <>
      <section>
        <h2>1. Застосунок</h2>
        <form className="row" onSubmit={handleAnalyze}>
          <input
            type="text"
            value={url}
            onChange={(e) => onUrl(e.target.value)}
            placeholder="https://play.google.com/store/apps/details?id=com.example.app"
            aria-label="Посилання на застосунок у Google Play"
            required
          />
          <input
            type="number"
            className="limit"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            min={1}
            max={MAX_REVIEWS}
            aria-label="Кількість відгуків"
            title="Кількість відгуків"
            required
          />
          <button type="submit" disabled={analyzing}>
            {analyzing ? "Аналізую…" : "Аналізувати"}
          </button>
        </form>
        <LocaleFields value={locale} onChange={onLocale} />
        <p className="muted">
          ШІ: {llmName} ·{" "}
          <button type="button" className="link" onClick={onShowSettings}>
            змінити
          </button>
        </p>
        {run.status === "running" && <RunProgress run={run} onShowAnalytics={onShowAnalytics} />}
        {run.status === "error" && <p className="alert error">{run.message}</p>}

        {analysis && !analyzing && (
          <div className="summary">
            {analysis.warning && <p className="alert warning">{analysis.warning}</p>}
            <p>
              <strong>{analysis.appId}</strong> ({languageName(analysis.locale.lang)}): оброблено відгуків — {analysis.stats.total}, середня
              оцінка — {analysis.analytics.averageScore.toFixed(1)}★
            </p>
            <p className="muted">
              З кешу: {analysis.stats.fromCache} · через LLM: {analysis.stats.fromLlm} · не вдалося
              класифікувати: {analysis.stats.fallbacks} · LLM-викликів: {analysis.stats.llmCalls}
            </p>
            <button type="button" className="link" onClick={onShowAnalytics}>
              Переглянути аналітику →
            </button>
          </div>
        )}
      </section>

      <section>
        <h2>2. Питання до відгуків</h2>
        {!analysis && <p className="muted">Спершу проаналізуйте застосунок.</p>}

        {messages.length > 0 && (
          <ul className="chat">
            {messages.map((message, index) => (
              <li key={index} className={message.role}>
                {message.text}
              </li>
            ))}
            {asking && <li className="assistant muted">Думаю…</li>}
          </ul>
        )}

        <form className="row" onSubmit={handleAsk}>
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="На що найбільше скаржаться?"
            aria-label="Питання до відгуків"
            disabled={!analysis || asking || analyzing}
          />
          <button type="submit" disabled={!analysis || asking || analyzing || !question.trim()}>
            Запитати
          </button>
        </form>
      </section>
    </>
  );
}

type RunProgressProps = {
  run: Extract<RunState, { status: "running" }>;
  onShowAnalytics: () => void;
};

/** What is happening right now: collecting, then "classified X of N" with a progress bar. */
function RunProgress({ run, onShowAnalytics }: RunProgressProps) {
  const { progress } = run;
  if (!progress) return <p className="muted">Збираю відгуки з Google Play…</p>;

  const grouping = progress.type === "grouping";
  const done = progress.type === "collected" ? 0 : grouping ? progress.total : progress.done;
  return (
    <div className="summary">
      {progress.type === "collected" && progress.warning && (
        <p className="alert warning">{progress.warning}</p>
      )}
      <p>
        Зібрано відгуків: {progress.total}. Класифіковано: {done} з {progress.total}
        {grouping && ". Об'єдную схожі теми…"}
      </p>
      <progress value={done} max={progress.total} />
      <p className="muted">
        На безкоштовних ШІ через ліміти запитів це може тривати кілька хвилин. Вкладку можна
        перемикати — аналіз не перерветься.
      </p>
      {done > 0 && (
        <button type="button" className="link" onClick={onShowAnalytics}>
          Переглянути проміжну аналітику →
        </button>
      )}
    </div>
  );
}
