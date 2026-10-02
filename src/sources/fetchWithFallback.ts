import type { Review, SourceName } from "../types";
import type { ReviewSource } from "./ReviewSource";

export type FetchResult = { reviews: Review[]; source: SourceName; warning?: string };

/** Tries the primary source; if it fails or returns nothing, uses the fallback and says why. */
export async function fetchWithFallback(
  primary: ReviewSource,
  fallback: ReviewSource,
): Promise<FetchResult> {
  let reason: string;
  try {
    const reviews = await primary.fetch();
    if (reviews.length > 0) return { reviews, source: "google-play" };
    reason = "Google Play не повернув жодного відгуку";
  } catch (error) {
    reason = `Не вдалося зібрати відгуки з Google Play (${errorMessage(error)})`;
  }

  const reviews = await fallback.fetch();
  return { reviews, source: "file", warning: `${reason}. Показано демо-дані з локального файлу.` };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
