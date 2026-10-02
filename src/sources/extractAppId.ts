// Android package name: at least two dot-separated segments, e.g. "com.spotify.music".
const APP_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/;

/**
 * Accepts a Google Play link (".../store/apps/details?id=com.foo.bar&hl=uk")
 * or a bare appId and returns the appId.
 */
export function extractAppId(input: string): string {
  const value = input.trim();
  if (APP_ID_PATTERN.test(value)) return value;

  let url: URL;
  try {
    // Links are often pasted without a scheme.
    url = new URL(value.includes("://") ? value : `https://${value}`);
  } catch {
    throw new Error("Це не схоже на посилання Google Play або appId");
  }

  if (url.hostname !== "play.google.com") {
    throw new Error("Очікується посилання на play.google.com");
  }
  const id = url.searchParams.get("id");
  if (!id || !APP_ID_PATTERN.test(id)) {
    throw new Error("У посиланні немає коректного параметра id");
  }
  return id;
}
