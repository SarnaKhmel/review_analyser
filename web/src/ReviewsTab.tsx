import { useState, type FormEvent } from "react";
import type { CollectResponse } from "../../src/types";
import { collect } from "./api";
import { languageName, LocaleFields, type LocaleChoice } from "./LocaleFields";

const STARS = [5, 4, 3, 2, 1];
// Keep in sync with maxCollectLimit in src/config.ts.
const MAX_REVIEWS = 5000;
const SOURCE_LABELS = { "google-play": "Google Play", file: "локальний файл" };

type Props = {
  url: string;
  onUrl: (url: string) => void;
  locale: LocaleChoice;
  onLocale: (locale: LocaleChoice) => void;
  collected: CollectResponse | null;
  onCollected: (result: CollectResponse) => void;
};

/** Collection only: downloads reviews by link and shows them as is, no LLM involved. */
export function ReviewsTab({ url, onUrl, locale, onLocale, collected, onCollected }: Props) {
  const [limit, setLimit] = useState(100);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      onCollected(await collect(url, limit, locale));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const reviews = collected?.reviews ?? [];
  const average = reviews.reduce((sum, review) => sum + review.score, 0) / (reviews.length || 1);

  return (
    <>
      <section>
        <h2>Завантаження відгуків</h2>
        <p className="muted">Лише збір із Google Play, без ШІ — ключ API не потрібен.</p>
        <form className="form-row" onSubmit={handleSubmit}>
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
          <button type="submit" disabled={loading}>
            {loading ? "Завантажую…" : "Завантажити"}
          </button>
        </form>
        <LocaleFields value={locale} onChange={onLocale} />
        {error && <p className="alert error">{error}</p>}
      </section>

      {collected && !loading && (
        <>
          <section>
            <h2>Підсумок</h2>
            {collected.warning && <p className="alert warning">{collected.warning}</p>}
            <p>
              <strong>{collected.appId}</strong>: відгуків — {reviews.length}, середня оцінка —{" "}
              {average.toFixed(1)}★
            </p>
            <p className="muted">
              Джерело: {SOURCE_LABELS[collected.source]} · мова: {languageName(collected.locale.lang)}
            </p>
            <ul className="bars">
              {STARS.map((star) => {
                const count = reviews.filter((review) => review.score === star).length;
                const share = reviews.length ? count / reviews.length : 0;
                return (
                  <li key={star}>
                    <span>{star}★</span>
                    <span className="bar">
                      <span style={{ width: `${share * 100}%` }} />
                    </span>
                    <span className="number">
                      {count} · {Math.round(share * 100)}%
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          <section>
            <h2>Відгуки</h2>
            <ul className="reviews">
              {reviews.map((review) => (
                <li key={review.id}>
                  <p className="muted">
                    <span className="stars">{"★".repeat(review.score)}</span>
                    {"☆".repeat(5 - review.score)} · {new Date(review.date).toLocaleDateString("uk-UA")}
                  </p>
                  <p>{review.text}</p>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </>
  );
}
