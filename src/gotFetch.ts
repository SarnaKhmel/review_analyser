/**
 * Stands in for `got` inside the Worker bundle (see `alias` in wrangler.jsonc).
 * google-play-scraper makes its requests through got, whose cookie handling does not run on
 * the Workers runtime; this covers the part of got's API the scraper uses, on top of fetch.
 */
type CookieJar = {
  getCookieString(url: string): Promise<string>;
  setCookie(cookie: string, url: string): Promise<unknown>;
};

type Options = {
  url: string;
  method?: string;
  body?: string;
  headers?: Record<string, string>;
  cookieJar?: CookieJar;
};

export default async function got({ url, method, body, headers, cookieJar }: Options) {
  const cookie = await cookieJar?.getCookieString(url);
  const response = await fetch(url, {
    method,
    body,
    headers: { ...headers, ...(cookie ? { cookie } : {}) },
  });

  // The scraper needs the cookies for consistent pagination across requests.
  for (const setCookie of response.headers.getSetCookie()) {
    await cookieJar?.setCookie(setCookie, url).catch(() => {});
  }

  const result = { statusCode: response.status, body: await response.text() };
  if (!response.ok) {
    // Same shape as got's HTTPError: the scraper reads `response.statusCode` to detect a 404.
    throw Object.assign(new Error(`Response code ${response.status}`), { response: result });
  }
  return result;
}
