import type { ClassifiedReview } from "../../src/types";
import { emptyCounts, type SentimentCounts } from "./charts";

const DAY = 24 * 60 * 60 * 1000;

type Unit = "day" | "week" | "month";

/** Start of the bucket a moment falls into (UTC). Weeks start on Monday. */
function bucketStart(time: number, unit: Unit): number {
  const date = new Date(time);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  if (unit === "month") return Date.UTC(year, month, 1);

  const day = Date.UTC(year, month, date.getUTCDate());
  if (unit === "day") return day;
  const weekday = (date.getUTCDay() + 6) % 7; // Monday = 0
  return day - weekday * DAY;
}

function nextBucket(start: number, unit: Unit): number {
  if (unit === "day") return start + DAY;
  if (unit === "week") return start + 7 * DAY;
  const date = new Date(start);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
}

const pad = (value: number) => String(value).padStart(2, "0");

function label(start: number, unit: Unit): string {
  const date = new Date(start);
  const month = pad(date.getUTCMonth() + 1);
  return unit === "month" ? `${month}.${date.getUTCFullYear()}` : `${pad(date.getUTCDate())}.${month}`;
}

export type Timeline = {
  unitLabel: string;
  buckets: { key: string; label: string; counts: SentimentCounts }[];
};

/**
 * Reviews over time by sentiment. The step adapts to the period covered: days for up to
 * six weeks, weeks for up to a year, months beyond. Empty periods are kept, so gaps stay visible.
 */
export function buildTimeline(reviews: ClassifiedReview[]): Timeline | null {
  const times = reviews.map((review) => Date.parse(review.date)).filter((time) => !Number.isNaN(time));
  if (times.length === 0) return null;

  const first = Math.min(...times);
  const last = Math.max(...times);
  const days = (last - first) / DAY;
  const unit: Unit = days <= 42 ? "day" : days <= 365 ? "week" : "month";

  const counts = new Map<number, SentimentCounts>();
  for (let start = bucketStart(first, unit); start <= last; start = nextBucket(start, unit)) {
    counts.set(start, emptyCounts());
  }
  for (const review of reviews) {
    const bucket = counts.get(bucketStart(Date.parse(review.date), unit));
    if (bucket) bucket[review.sentiment]++;
  }

  return {
    unitLabel: { day: "за днями", week: "за тижнями", month: "за місяцями" }[unit],
    buckets: [...counts].map(([start, bucketCounts]) => ({
      key: String(start),
      label: label(start, unit),
      counts: bucketCounts,
    })),
  };
}
