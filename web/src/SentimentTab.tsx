import { useMemo, useState } from "react";
import { aggregate } from "../../src/analytics/aggregate";
import {
  CATEGORIES,
  SENTIMENTS,
  SEVERITIES,
  type AnalyzeResponse,
  type Category,
  type ClassifiedReview,
  type Severity,
  type TopProblem,
} from "../../src/types";
import type { RunState } from "./App";
import {
  emptyCounts,
  Legend,
  SentimentSplit,
  StackedColumns,
  StackedRows,
  type SentimentCounts,
} from "./charts";
import { ExpandableText } from "./ExpandableText";
import {
  CATEGORY_LABELS,
  moodKey,
  moodKeyOf,
  moodLabel,
  MOODS,
  moodScore,
  SENTIMENT_LABELS,
  SEVERITY_LABELS,
  TOPIC_HEADINGS,
} from "./labels";
import { MOOD_LEVEL_LABELS, MoodFace, moodLevel } from "./MoodFace";
import { buildTimeline } from "./timeline";

const STARS = [1, 2, 3, 4, 5];
const TOPICS_SHOWN = 12;
const REVIEWS_PAGE = 20;

/** null = the dimension is not filtered. */
type Filters = {
  mood: string | null;
  category: Category | null;
  topic: string | null;
  severity: Severity | null;
  stars: number | null;
};

const NO_FILTERS: Filters = { mood: null, category: null, topic: null, severity: null, stars: null };

/** `skip` leaves one dimension out: used to count the options of that very dimension. */
function matches(review: ClassifiedReview, filters: Filters, skip?: keyof Filters): boolean {
  return (
    (skip === "mood" || !filters.mood || moodKey(review) === filters.mood) &&
    (skip === "category" || !filters.category || review.category === filters.category) &&
    (skip === "topic" || !filters.topic || review.topic === filters.topic) &&
    (skip === "severity" || !filters.severity || review.severity === filters.severity) &&
    (skip === "stars" || !filters.stars || review.score === filters.stars)
  );
}

/** Groups reviews by a key and counts sentiments inside each group. */
function countBy(reviews: ClassifiedReview[], keyOf: (review: ClassifiedReview) => string) {
  const groups = new Map<string, SentimentCounts>();
  for (const review of reviews) {
    const key = keyOf(review);
    const counts = groups.get(key) ?? emptyCounts();
    counts[review.sentiment]++;
    groups.set(key, counts);
  }
  return groups;
}

type Props = { analysis: AnalyzeResponse | null; run: RunState };

export function SentimentTab({ analysis, run }: Props) {
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [shown, setShown] = useState(REVIEWS_PAGE);

  // While a run is in progress, show what it has classified so far instead of the previous result.
  const progress = run.status === "running" ? run.progress : null;
  const live = progress && progress.type !== "collected" ? progress : null;
  const appId = live?.appId ?? analysis?.appId ?? "";
  const reviews = live?.reviews ?? analysis?.reviews;

  const filtered = useMemo(
    () => (reviews ?? []).filter((review) => matches(review, filters)),
    [reviews, filters],
  );
  // The same pure function the server uses, applied to the filtered reviews.
  const analytics = useMemo(() => aggregate(appId, filtered), [appId, filtered]);
  const timeline = useMemo(() => buildTimeline(filtered), [filtered]);

  if (!reviews || reviews.length === 0) {
    return (
      <section>
        <p className="muted">
          {run.status === "running"
            ? "Аналіз триває, перші результати з'являться за мить."
            : "Даних ще немає. Проаналізуйте застосунок на вкладці «Збір + чат»."}
        </p>
      </section>
    );
  }

  function update(patch: Partial<Filters>) {
    // Topics belong to a category: changing the category drops the chosen topic.
    setFilters((current) => ({ ...current, ...patch, ...("category" in patch ? { topic: null } : {}) }));
    setShown(REVIEWS_PAGE);
  }
  /** Clicking the active option again clears it. */
  const toggle = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    update({ [key]: filters[key] === value ? null : value } as Partial<Filters>);

  // Each filter shows counts for the current selection of all the *other* filters.
  const forOptions = (skip: keyof Filters) => reviews.filter((review) => matches(review, filters, skip));
  const byMood = countBy(forOptions("mood"), moodKey);
  const byCategory = countBy(forOptions("category"), (review) => review.category);
  const bySeverity = countBy(forOptions("severity"), (review) => review.severity);
  const byStars = countBy(forOptions("stars"), (review) => String(review.score));
  const byTopic = [...countBy(forOptions("topic").filter((review) => review.topic), (review) => review.topic)]
    .map(([topic, counts]) => ({ key: topic, label: topic, counts }))
    .sort((a, b) => sum(b.counts) - sum(a.counts));

  const sentimentTotals = emptyCounts();
  for (const review of filtered) sentimentTotals[review.sentiment]++;
  const furious = filtered.filter((review) => moodKey(review) === "negative-strong").length;
  const delighted = filtered.filter((review) => moodKey(review) === "positive-strong").length;
  const averageMood = filtered.reduce((total, review) => total + moodScore(review), 0) / (filtered.length || 1);
  const level = moodLevel(averageMood);
  const share = (count: number) => (filtered.length ? `${Math.round((count / filtered.length) * 100)}%` : "—");
  const isFiltered = Object.values(filters).some((value) => value !== null);

  const { sentimentByScore } = analytics;
  const columnTotals = STARS.map((_, column) =>
    SENTIMENTS.reduce((total, sentiment) => total + (sentimentByScore[sentiment][column] ?? 0), 0),
  );

  return (
    <>
      {live && (
        <p className="alert warning">
          Проміжний результат: класифіковано {live.reviews.length} з {live.total} відгуків. Аналіз триває.
        </p>
      )}

      <section>
        <div className="section-head">
          <h2>Фільтри</h2>
          {isFiltered && (
            <button type="button" className="link" onClick={() => update(NO_FILTERS)}>
              Скинути всі
            </button>
          )}
        </div>
        <FilterRow label="Категорія">
          {CATEGORIES.filter((category) => byCategory.has(category)).map((category) => (
            <Chip
              key={category}
              active={filters.category === category}
              count={sum(byCategory.get(category))}
              onClick={() => toggle("category", category)}
            >
              {CATEGORY_LABELS[category]}
            </Chip>
          ))}
        </FilterRow>
        <FilterRow label="Емоція">
          {MOODS.filter((mood) => byMood.has(moodKeyOf(mood))).map((mood) => (
            <Chip
              key={mood.label}
              active={filters.mood === moodKeyOf(mood)}
              count={sum(byMood.get(moodKeyOf(mood)))}
              onClick={() => toggle("mood", moodKeyOf(mood))}
            >
              {mood.label}
            </Chip>
          ))}
        </FilterRow>
        <FilterRow label="Серйозність">
          {[...SEVERITIES].reverse().filter((severity) => bySeverity.has(severity)).map((severity) => (
            <Chip
              key={severity}
              active={filters.severity === severity}
              count={sum(bySeverity.get(severity))}
              onClick={() => toggle("severity", severity)}
            >
              {SEVERITY_LABELS[severity]}
            </Chip>
          ))}
        </FilterRow>
        <FilterRow label="Оцінка">
          {STARS.filter((star) => byStars.has(String(star))).map((star) => (
            <Chip
              key={star}
              active={filters.stars === star}
              count={sum(byStars.get(String(star)))}
              onClick={() => toggle("stars", star)}
            >
              {star}★
            </Chip>
          ))}
        </FilterRow>
        {filters.topic && (
          <FilterRow label="Тема">
            <Chip active count={filtered.length} onClick={() => update({ topic: null })}>
              {filters.topic} ✕
            </Chip>
          </FilterRow>
        )}
      </section>

      <section>
        <div className="tiles">
          <Tile label={isFiltered ? `Відгуків (із ${reviews.length})` : "Відгуків"} value={String(filtered.length)} />
          <Tile label="Середня оцінка" value={filtered.length ? `${analytics.averageScore.toFixed(1)}★` : "—"} />
          <Tile label="Негативних" value={share(sentimentTotals.negative)} />
          <Tile label="Розлючених" value={String(furious)} />
          <Tile label="У захваті" value={String(delighted)} />
        </div>
        <SentimentSplit counts={sentimentTotals} />
      </section>

      {filtered.length === 0 ? (
        <section>
          <p className="muted">Під ці фільтри не підходить жоден відгук.</p>
        </section>
      ) : (
        <>
          <section>
            <h2>Емоції: від розлючених до захоплених</h2>
            <div className="mood">
              <figure>
                <MoodFace level={level} />
                <figcaption>
                  <strong>{MOOD_LEVEL_LABELS[level]}</strong>
                  <span className="muted">
                    Середній настрій: {averageMood > 0 ? "+" : ""}
                    {averageMood.toFixed(1)} за шкалою від −3 до +3
                  </span>
                </figcaption>
              </figure>
              <div>
                <p className="muted">Натисніть на рядок, щоб відфільтрувати.</p>
                <StackedRows
                  rows={MOODS.map((mood) => ({
                    key: moodKeyOf(mood),
                    label: mood.label,
                    counts: byMood.get(moodKeyOf(mood)) ?? emptyCounts(),
                  }))}
                  selected={filters.mood}
                  onSelect={(key) => toggle("mood", key)}
                />
              </div>
            </div>
          </section>

          <div className="grid">
            <section>
              <h2>Оцінки</h2>
              <StackedColumns
                columns={STARS.map((star, column) => ({
                  key: String(star),
                  label: `${star}★`,
                  counts: {
                    positive: sentimentByScore.positive[column] ?? 0,
                    neutral: sentimentByScore.neutral[column] ?? 0,
                    negative: sentimentByScore.negative[column] ?? 0,
                  },
                }))}
              />
              <Legend />
            </section>
            {timeline && (
              <section>
                <h2>
                  Динаміка <span className="muted">{timeline.unitLabel}</span>
                </h2>
                <StackedColumns
                  columns={timeline.buckets}
                  labelEvery={Math.ceil(timeline.buckets.length / 5)}
                />
                <Legend />
              </section>
            )}
          </div>

          <section>
            <h2>Категорії</h2>
            <p className="muted">Натисніть на категорію, щоб побачити її теми.</p>
            <StackedRows
              rows={CATEGORIES.filter((category) => byCategory.has(category))
                .map((category) => ({
                  key: category as string,
                  label: CATEGORY_LABELS[category],
                  counts: byCategory.get(category) ?? emptyCounts(),
                }))
                .sort((a, b) => sum(b.counts) - sum(a.counts))}
              selected={filters.category}
              onSelect={(key) => toggle("category", key as Category)}
            />
            <Legend />
          </section>

          <section>
            <h2>{(filters.category && TOPIC_HEADINGS[filters.category]) ?? "Теми відгуків"}</h2>
            <p className="muted">
              {filters.category
                ? `Про що саме пишуть у категорії «${CATEGORY_LABELS[filters.category]}». Натисніть, щоб лишити одну тему.`
                : "Найчастіші теми в усіх категоріях. Оберіть категорію, щоб побачити типи помилок чи запити на покращення."}
            </p>
            {byTopic.length === 0 ? (
              <p className="muted">Тем немає.</p>
            ) : (
              <StackedRows
                rows={byTopic.slice(0, TOPICS_SHOWN)}
                selected={filters.topic}
                onSelect={(key) => toggle("topic", key)}
              />
            )}
            {byTopic.length > TOPICS_SHOWN && (
              <p className="muted">Показано {TOPICS_SHOWN} найчастіших із {byTopic.length}.</p>
            )}
          </section>

          <section>
            <h2>Тональність × оцінка</h2>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Тональність</th>
                    {STARS.map((star) => (
                      <th scope="col" key={star} className="number">
                        {star}★
                      </th>
                    ))}
                    <th scope="col" className="number">
                      Разом
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {SENTIMENTS.map((sentiment) => {
                    const row = sentimentByScore[sentiment];
                    return (
                      <tr key={sentiment}>
                        <th scope="row">{SENTIMENT_LABELS[sentiment]}</th>
                        {row.map((count, column) => (
                          <td key={column} className={count === 0 ? "number zero" : "number"}>
                            {count}
                          </td>
                        ))}
                        <td className="number total">{row.reduce((total, count) => total + count, 0)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">Разом</th>
                    {columnTotals.map((count, column) => (
                      <td key={column} className="number total">
                        {count}
                      </td>
                    ))}
                    <td className="number total">{analytics.total}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          <section>
            <h2>Топ болі користувачів</h2>
            <p className="muted">
              Конкретні проблеми, впорядковані за вагою (висока серйозність важить утричі більше за низьку).
            </p>
            {analytics.topProblems.length === 0 && <p className="muted">Скарг не знайдено.</p>}
            <ol className="problems">
              {analytics.topProblems.map((problem) => (
                <Problem key={`${problem.category}|${problem.topic}`} problem={problem} />
              ))}
            </ol>
          </section>

          <section>
            <h2>
              Відгуки <span className="muted">— {filtered.length}</span>
            </h2>
            <ul className="reviews">
              {filtered.slice(0, shown).map((review) => (
                <li key={review.id}>
                  <p className="muted">
                    <span className="stars">{"★".repeat(review.score)}</span>
                    {"☆".repeat(5 - review.score)} · {new Date(review.date).toLocaleDateString("uk-UA")} ·{" "}
                    {CATEGORY_LABELS[review.category]}
                    {review.topic && ` · ${review.topic}`} · {moodLabel(review)} · серйозність:{" "}
                    {SEVERITY_LABELS[review.severity].toLowerCase()}
                  </p>
                  <p>
                    <ExpandableText text={review.text} />
                  </p>
                </li>
              ))}
            </ul>
            {filtered.length > shown && (
              <button type="button" className="chip" onClick={() => setShown(shown + REVIEWS_PAGE)}>
                Показати ще ({filtered.length - shown})
              </button>
            )}
          </section>
        </>
      )}
    </>
  );
}

const sum = (counts: SentimentCounts | undefined) =>
  counts ? counts.positive + counts.neutral + counts.negative : 0;

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="filter-row">
      <span className="filter-label">{label}</span>
      <div className="presets">{children}</div>
    </div>
  );
}

type ChipProps = { active: boolean; count: number; onClick: () => void; children: React.ReactNode };

function Chip({ active, count, onClick, children }: ChipProps) {
  return (
    <button type="button" className={active ? "chip active" : "chip"} aria-pressed={active} onClick={onClick}>
      {children} <span className="muted">{count}</span>
    </button>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="tile">
      <span className="muted">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

/** One pain: what it is, how bad, the full reviews behind it and a ready ticket draft. */
function Problem({ problem }: { problem: TopProblem }) {
  const [copied, setCopied] = useState(false);
  const ticket = JSON.stringify(problem.ticket, null, 2);

  async function copyTicket() {
    try {
      await navigator.clipboard.writeText(ticket);
      setCopied(true);
    } catch {
      // Clipboard access can be blocked; the JSON stays selectable below.
    }
  }

  return (
    <li>
      <h3>
        {problem.topic || CATEGORY_LABELS[problem.category]}{" "}
        <span className="muted">
          — {CATEGORY_LABELS[problem.category]}, відгуків: {problem.count}
        </span>
      </h3>
      <p className="muted">
        Серйозність: висока {problem.bySeverity.high} · середня {problem.bySeverity.medium} · низька{" "}
        {problem.bySeverity.low}
      </p>
      {problem.examples.map((example) => (
        <blockquote key={example.id}>
          <span className="muted">
            {example.score}★ · {new Date(example.date).toLocaleDateString("uk-UA")}
          </span>
          <br />
          <ExpandableText text={example.text} />
        </blockquote>
      ))}
      {problem.count > problem.examples.length && (
        <p className="muted">
          Показано {problem.examples.length} найсерйозніших із {problem.count}. Решту видно у списку
          відгуків, якщо обрати цю тему у фільтрах.
        </p>
      )}
      <details>
        <summary>Чернетка тікета (JSON, з повними текстами відгуків)</summary>
        <pre>{ticket}</pre>
        <button type="button" className="chip" onClick={copyTicket}>
          {copied ? "Скопійовано" : "Копіювати JSON"}
        </button>
      </details>
    </li>
  );
}
