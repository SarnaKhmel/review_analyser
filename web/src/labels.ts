import type { Category, Intensity, Sentiment, Severity } from "../../src/types";

export const SENTIMENT_LABELS: Record<Sentiment, string> = {
  positive: "Позитивна",
  neutral: "Нейтральна",
  negative: "Негативна",
};

export const CATEGORY_LABELS: Record<Category, string> = {
  bug: "Помилки",
  pricing: "Ціна й оплата",
  ux: "Зручність",
  performance: "Швидкодія",
  feature: "Бракує функцій",
  support: "Підтримка",
  praise: "Похвала",
  other: "Інше",
};

export const SEVERITY_LABELS: Record<Severity, string> = {
  high: "Висока",
  medium: "Середня",
  low: "Низька",
};

/** Sentiment + intensity = mood, from furious to delighted. Listed from the angriest to the happiest. */
export const MOODS: { sentiment: Sentiment; intensity: Intensity | null; label: string; score: number }[] = [
  { sentiment: "negative", intensity: "strong", label: "Розлючені", score: -3 },
  { sentiment: "negative", intensity: "moderate", label: "Роздратовані", score: -2 },
  { sentiment: "negative", intensity: "mild", label: "Незадоволені", score: -1 },
  { sentiment: "neutral", intensity: null, label: "Нейтральні", score: 0 },
  { sentiment: "positive", intensity: "mild", label: "Задоволені", score: 1 },
  { sentiment: "positive", intensity: "moderate", label: "Раді", score: 2 },
  { sentiment: "positive", intensity: "strong", label: "У захваті", score: 3 },
];

/** −3 (furious) … +3 (delighted). */
export const moodScore = (review: { sentiment: Sentiment; intensity: Intensity }) =>
  MOODS.find((mood) => moodKeyOf(mood) === moodKey(review))?.score ?? 0;

/** Neutral reviews form one mood whatever their intensity. */
export const moodKey = (review: { sentiment: Sentiment; intensity: Intensity }) =>
  review.sentiment === "neutral" ? "neutral" : `${review.sentiment}-${review.intensity}`;

export const moodKeyOf = (mood: (typeof MOODS)[number]) =>
  mood.intensity === null ? "neutral" : `${mood.sentiment}-${mood.intensity}`;

export const moodLabel = (review: { sentiment: Sentiment; intensity: Intensity }) =>
  MOODS.find((mood) => moodKeyOf(mood) === moodKey(review))?.label ?? "";

/** Heading of the topic list: the user thinks "types of bugs" and "improvements", not "topics". */
export const TOPIC_HEADINGS: Partial<Record<Category, string>> = {
  bug: "Типи помилок",
  feature: "Які покращення просять",
  ux: "Що незручно",
  performance: "Що працює повільно",
  pricing: "Що не так з ціною й оплатою",
  support: "Проблеми з підтримкою",
  praise: "За що хвалять",
};
