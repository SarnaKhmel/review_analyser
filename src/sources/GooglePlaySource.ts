import gplay from "google-play-scraper";
import type { Locale, Review } from "../types";
import type { ReviewSource } from "./ReviewSource";

// The library's typings do not expose `gplay.sort.NEWEST` correctly, so the value is spelled out.
const SORT_NEWEST = 2;

/** Fetches the newest reviews of an app through the unofficial Google Play API. */
export class GooglePlaySource implements ReviewSource {
  constructor(
    private readonly appId: string,
    private readonly limit: number,
    private readonly locale: Locale,
  ) {}

  async fetch(): Promise<Review[]> {
    const { data } = await gplay.reviews({
      appId: this.appId,
      sort: SORT_NEWEST,
      num: this.limit,
      // Google Play serves a separate set of reviews per language and country.
      lang: this.locale.lang,
      country: this.locale.country,
    });

    return data
      .filter((item) => item.text?.trim())
      .map((item) => ({
        id: item.id,
        text: item.text.trim(),
        score: item.score,
        date: new Date(item.date).toISOString(),
      }));
  }
}
