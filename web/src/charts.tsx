import { SENTIMENTS, type Sentiment } from "../../src/types";
import { SENTIMENT_LABELS } from "./labels";

// Every chart here encodes sentiment the same way: positive (blue), neutral (gray),
// negative (red), always in this order. Colors live in styles.css as --pos / --neu / --neg.

export type SentimentCounts = Record<Sentiment, number>;

export const emptyCounts = (): SentimentCounts => ({ positive: 0, neutral: 0, negative: 0 });
export const totalOf = (counts: SentimentCounts) => counts.positive + counts.neutral + counts.negative;

type Datum = { key: string; label: string; counts: SentimentCounts };

function tooltip(label: string, counts: SentimentCounts): string {
  const lines = SENTIMENTS.map((sentiment) => `${SENTIMENT_LABELS[sentiment]}: ${counts[sentiment]}`);
  return [label, ...lines, `Разом: ${totalOf(counts)}`].join("\n");
}

/** Segments of one stacked bar, in the fixed sentiment order; empty ones are not drawn. */
function Segments({ counts }: { counts: SentimentCounts }) {
  return (
    <>
      {SENTIMENTS.filter((sentiment) => counts[sentiment] > 0).map((sentiment) => (
        <span key={sentiment} className={`seg ${sentiment}`} style={{ flexGrow: counts[sentiment] }} />
      ))}
    </>
  );
}

export function Legend() {
  return (
    <ul className="legend">
      {SENTIMENTS.map((sentiment) => (
        <li key={sentiment}>
          <span className={`swatch ${sentiment}`} />
          {SENTIMENT_LABELS[sentiment]}
        </li>
      ))}
    </ul>
  );
}

/** One 100% bar: the share of each sentiment, labelled directly. */
export function SentimentSplit({ counts }: { counts: SentimentCounts }) {
  const total = totalOf(counts);
  if (total === 0) return null;

  return (
    <div>
      <div className="split" tabIndex={0} data-tip={tooltip("Усі відгуки", counts)}>
        <Segments counts={counts} />
      </div>
      <ul className="legend">
        {SENTIMENTS.map((sentiment) => (
          <li key={sentiment}>
            <span className={`swatch ${sentiment}`} />
            {SENTIMENT_LABELS[sentiment]} <strong>{Math.round((counts[sentiment] / total) * 100)}%</strong>
            <span className="muted">({counts[sentiment]})</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

type RowsProps = {
  rows: Datum[];
  /** Makes rows clickable (used as a filter). */
  onSelect?: (key: string) => void;
  selected?: string | null;
};

/** Horizontal stacked bars, longest first; the total sits at the tip of each bar. */
export function StackedRows({ rows, onSelect, selected }: RowsProps) {
  const max = Math.max(1, ...rows.map((row) => totalOf(row.counts)));

  return (
    <ul className="rows">
      {rows.map((row) => {
        const total = totalOf(row.counts);
        const content = (
          <>
            <span className="row-label">{row.label}</span>
            <span className="row-track">
              <span className="row-bar" style={{ width: `${(total / max) * 100}%` }}>
                <Segments counts={row.counts} />
              </span>
              <span className="row-value">{total}</span>
            </span>
          </>
        );
        const tip = tooltip(row.label, row.counts);

        return (
          <li key={row.key}>
            {onSelect ? (
              <button
                type="button"
                className={selected === row.key ? "row active" : "row"}
                aria-pressed={selected === row.key}
                data-tip={tip}
                onClick={() => onSelect(row.key)}
              >
                {content}
              </button>
            ) : (
              <div className="row" tabIndex={0} data-tip={tip}>
                {content}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** A round maximum for the value axis: 7 → 8, 23 → 30, 140 → 150. */
function niceMax(value: number): number {
  if (value <= 4) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 1.5, 2, 3, 4, 5, 6, 8, 10].find((s) => s * magnitude >= value) ?? 10;
  return step * magnitude;
}

type ColumnsProps = {
  columns: Datum[];
  /** Show only every n-th label under the columns (for long time series). */
  labelEvery?: number;
};

/** Vertical stacked columns on one value axis with three recessive gridlines. */
export function StackedColumns({ columns, labelEvery = 1 }: ColumnsProps) {
  const max = niceMax(Math.max(...columns.map((column) => totalOf(column.counts)), 1));

  return (
    <div className="columns">
      <div className="columns-axis">
        <span>{max}</span>
        <span>{max / 2}</span>
        <span>0</span>
      </div>
      <div className="columns-plot">
        {columns.map((column, index) => (
          <div
            key={column.key}
            className={index < columns.length / 2 ? "column tip-right" : "column tip-left"}
            tabIndex={0}
            data-tip={tooltip(column.label, column.counts)}
          >
            <div className="column-stack" style={{ height: `${(totalOf(column.counts) / max) * 100}%` }}>
              <Segments counts={column.counts} />
            </div>
            <span className="column-label">{index % labelEvery === 0 ? column.label : ""}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
