import type { Locale } from "../types";

/**
 * Reads the language (`hl`) and country (`gl`) from a Google Play link, if present.
 * "hl=en_US" and "hl=en-US" both give lang "en". A bare appId gives nothing.
 */
export function extractLocale(input: string): Partial<Locale> {
  const value = input.trim();
  let params: URLSearchParams;
  try {
    params = new URL(value.includes("://") ? value : `https://${value}`).searchParams;
  } catch {
    return {};
  }

  return {
    lang: twoLetters(params.get("hl")?.split(/[_-]/)[0]),
    country: twoLetters(params.get("gl")),
  };
}

function twoLetters(value: string | undefined | null): string | undefined {
  const code = value?.trim().toLowerCase();
  return code && /^[a-z]{2}$/.test(code) ? code : undefined;
}
