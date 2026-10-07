# Review Insights

Paste a link to a Google Play app and find out what users complain about and what to fix first.

Review Insights collects the reviews, classifies each one with an LLM (sentiment, problem category, severity, topic), shows analytics, and answers questions about the data in plain language.

A training MVP. Author: Oleksa Sarnatskyi.

> The interface is in Ukrainian. Tab and button names below are given in English with the original label in brackets.

## What it does

- **Collects reviews** by link or `appId`, in one language or in ten at once.
- **Classifies them with AI**: positive / neutral / negative, problem category, severity, a short topic.
- **Analytics with filters**: categories, emotions, ratings, topics, top pains with a ticket draft.
- **Chat**: "what annoys users most after the last update?" — answered with numbers and quotes.
- **Any AI**: Claude or an OpenAI-compatible API (Ollama, Groq, Gemini, OpenRouter, OpenAI).

## Quick start

Requires Node.js 22 or newer.

```bash
npm install                # backend and frontend (web/) dependencies
cp .env.example .env       # fill in ANTHROPIC_API_KEY
npm run dev                # API on :3001, UI on http://localhost:5173
```

No key? Collecting reviews works without one, and for the analysis you can connect your own AI on the Settings tab («Налаштування»).

| Command | What it does |
| --- | --- |
| `npm run dev` | Backend and frontend for development |
| `npm run cli -- <link or appId> [count] [language] [country]` | The same analysis in the console, without the UI |
| `npm run collect -- <link or appId> [count] [language] [country]` | Collection only, no LLM and no key; saves to `data/reviews/<appId>.json` |
| `npm test` | Unit tests (the LLM is replaced with a fake, no key needed) |
| `npm run typecheck` | Type check of the backend and the frontend |
| `npm run dev:worker` | Run it the way Cloudflare does: http://localhost:8787 |
| `npm run deploy` | Build the frontend and deploy to Cloudflare by hand |

## Deploying to Cloudflare

The app lives in a single Cloudflare Worker on the free plan: the Worker serves the built frontend as static assets and handles `/api/*` with the same Express app. Workers KV takes the place of the disk.

### Automatically, on merge to `main`

GitHub Actions (`.github/workflows/deploy.yml`) runs the type check and the tests on every pull request, and after a merge to `main` it also deploys.

One-time setup:

1. Sign up at [dash.cloudflare.com](https://dash.cloudflare.com) and copy the **Account ID** (Workers & Pages page, right column).
2. Create an API token: **My Profile → API Tokens → Create Token**, template **Edit Cloudflare Workers**.
3. In the GitHub repository open **Settings → Secrets and variables → Actions** and add two secrets:
   - `CLOUDFLARE_API_TOKEN` — the token from step 2;
   - `CLOUDFLARE_ACCOUNT_ID` — the identifier from step 1.

After the first deploy the app is available at `https://review-analyser.<your-subdomain>.workers.dev` — the exact address is printed in the log of the deploy step. The KV namespace is created during that first deploy.

### By hand

```bash
npx wrangler login
npm run deploy
```

### No keys on the server

The deployed app holds no AI key at all: every visitor connects their own API on the Settings tab (a Claude key or any OpenAI-compatible API). The "server key" option is not offered there, and the Worker ignores `ANTHROPIC_API_KEY` even if it is added as a secret. So the public address cannot spend anyone else's money.

The only secrets of the project are `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in GitHub: they exist only so that GitHub Actions can publish the code, and they never reach the app itself.

### Free plan limits

- **50 outgoing requests per request to the Worker.** An analysis in one language fits even at 500 reviews. "All languages" with a large number of reviews may not fit: every language means separate requests to Google Play.
- **10 ms of CPU time per request.** Waiting for the LLM does not count, but on large samples the limit is worth checking in practice.
- **1000 KV writes per day.** One analysis makes up to three writes.
- Google Play may answer Cloudflare's servers differently than a home computer. If collection fails, the app shows demo data and a warning.

## The user's own AI

On the Settings tab the user chooses which AI classifies the reviews and answers in the chat:

- **Claude, server key** — `ANTHROPIC_API_KEY` from `.env`. Local runs only.
- **Claude, own key.**
- **Another AI** — any OpenAI-compatible API: address, model name and, if needed, a key. Ready-made addresses are provided for Ollama, Groq, Gemini, OpenRouter and OpenAI.

The settings live in the browser's `localStorage` and are sent in the body of every request (`llm`); the server builds a client for them through `createLlm` and stores them nowhere. The "Test connection" button («Перевірити підключення») makes one short request to the chosen AI.

Providers' free tiers have strict limits (for example, Groq: 8000 tokens per minute), so:

- on a 429 the client waits as long as the provider asks in the `Retry-After` header and repeats the request (up to 5 times);
- the chat sends such providers a smaller sample of reviews (`chatContextChars` in `src/config.ts`);
- you do not have to know the model name: the "Pick a model automatically" button («Підібрати модель автоматично») takes the list from the provider's `GET /models`, drops non-text models and picks the first one that actually answered a test request;
- if the provider rejects a request in JSON mode (Groq sometimes returns 400 `json_validate_failed`), the batch is asked again as plain text.

For OpenAI-compatible APIs the response format is described in the prompt, and the API is only asked for valid JSON (`response_format: json_object`), because support for JSON schemas differs between providers. After that the same guardrail applies: Zod validation, retry, fallback. The classification cache is separate for every model.

Locally the API listens on `127.0.0.1` only; `HOST=0.0.0.0` opens it to the network. The server calls whatever API address the client names, so do not expose it from your own network without an allowlist of addresses (SSRF). On Cloudflare the Worker has no access to private networks, but the user's key still sits in `localStorage` — a weak spot for production.

## Review language and country

Google Play serves a separate set of reviews for every language. The language is resolved in this order: explicit choice in the request (`lang`) → the `hl` parameter of the link → the default `en`. The country (`country` / `gl`) is passed to the scraper too, but the UI does not show it: in practice the language determines the set of reviews.

The value `all` ("All languages" in the UI) makes a separate request for every language listed in `allLanguages` in `src/config.ts`, merges the results by id and keeps the newest ones within the limit (`MergedSource`). Google Play has no single "any language" request.

Language here means the language Google assigned to the review, not necessarily the language of the text. For an app with a Ukrainian audience, most texts in the "English" set are Ukrainian anyway.

## Analytics

The Analytics tab («Аналітика») computes everything in the browser from the classified reviews with the same pure `aggregate` function the server uses, so the filters work instantly and without requests.

- **Filters:** category, emotion, severity, rating, topic. The counter next to each option takes the other selected filters into account.
- **Topics.** Besides the fixed category, the AI gives every review a short topic ("app crash", "expensive subscription"). Batches are classified independently, so one problem arrives under several wordings; a second pass (`TopicGrouper`, one request per category, the result is cached) merges them into 3–7 topics per category. Choose the "Bugs" category and the topics become kinds of bugs; choose "Missing features" and they become improvement requests.
- **Emotions.** The `intensity` field (mild / moderate / strong) together with the sentiment gives seven levels from "Furious" to "Delighted". The average mood on a scale from −3 to +3 picks one of four faces (`MoodFace`, drawn in SVG).
- **Charts** are built with HTML/CSS, without libraries. All of them encode sentiment the same way: blue for positive, grey for neutral, red for negative.
- **Top pains** — up to 15 specific problems (category + topic), ordered by severity weight, with the full review texts and a ticket draft.

## How the LLM processing works

1. **Cache.** A sha256 of the text is computed for every review. Whatever is already in the cache does not go to the LLM.
2. **Batching.** The rest is cut into batches of 20, up to 4 batches in parallel. 100 new reviews = 5 requests instead of 100.
3. **Structured output.** The request carries `output_config.format` — the API constrains the answer to a JSON schema generated from Zod.
4. **Validation.** The answer is additionally checked with `batchSchema.safeParse`, and the results are matched to the reviews by `index`.
5. **Retry.** If the answer is invalid or some reviews are missing, one more request is made for the remaining ones only.
6. **Fallback.** Whatever fails a second time gets `neutral / other / low`. Such results are not cached, so the next run tries again. Their count is shown in the UI ("could not classify").

The cache key includes the model and the prompt version: after changing `CLASSIFY_SYSTEM_PROMPT`, bump `CLASSIFY_PROMPT_VERSION` in `src/llm/prompts.ts`, otherwise reviews seen before keep their old classification.

If the client drops the connection to `/api/analyze/stream` (closes the tab), the server starts no new LLM requests; the batches already finished stay in the cache.

Errors of the API itself (no key, 401, 429, network) are not disguised as a fallback: the user sees a clear message.

### Reproducibility without temperature

The spec called for a "low temperature". Current Claude models (Opus 4.7 and newer) no longer accept sampling parameters: a request with `temperature` returns 400. Reproducibility here comes from a fixed prompt, a strict schema with enums, and the cache (the same text always gets the same result). `effort: "low"` keeps the cost down.

The default model is `claude-opus-5-5`; change it with `ANTHROPIC_MODEL`. If you choose Haiku 4.5, remove `effort` from `ClaudeClient` (that model does not support it).

## Chat

`POST /api/chat` does not send the model every review. The request carries the aggregates (table, categories, top problems) and a sample of the most severe reviews within a character budget (each cut to 400). The request stays small, and the model quotes exact numbers.

The chat answers from the latest analysis of the app. Locally it is kept in the process memory: after a server restart the app has to be analysed again (the classifications come from the cache). On Cloudflare it is kept in KV, so it survives restarts.

## Architecture

```
src/
  types.ts            domain types shared by the backend and the frontend
  sources/            where reviews come from
    ReviewSource.ts     interface ReviewSource { fetch(): Promise<Review[]> }
    GooglePlaySource.ts google-play-scraper
    FileSource.ts       local JSON (fallback)
    StaticSource.ts     the same demo data, bundled into the Worker
    MergedSource.ts     several sources in one: "all languages"
    fetchWithFallback.ts primary source → on failure or empty result, demo data + a warning
    extractAppId.ts     Google Play link → appId
    extractLocale.ts    hl/gl parameters of the link → language and country
  llm/                everything about the LLM
    LlmClient.ts        the interface: classifyBatch + answer
    ClaudeClient.ts     implementation on @anthropic-ai/sdk (structured output)
    OpenAiCompatibleClient.ts any OpenAI-compatible API
    createLlm.ts        picks the client for a request: the user's AI or the server default
    ReviewClassifier.ts cache → batching → validation → retry → fallback
    ClassificationCache.ts cache keyed by sha256 of the review text
    TopicGrouper.ts     second pass: raw topics → 3–7 topics per category
    schema.ts, prompts.ts Zod schemas and fixed prompts
    chat.ts             answers a question from the aggregates + a sample of reviews
  storage/TextStore.ts where the cache lives: a file (locally) or Workers KV (Cloudflare)
  analytics/          pure functions without I/O
    aggregate.ts        sentiment × stars, categories, top problems
    ticket.ts           ticket payload (Jira is not called)
  api/                Express: /api/reviews, /api/analyze, /api/analyze/stream, /api/chat, /api/llm/*
    server.ts           entry point for Node.js
  AnalysisService.ts  use cases: collect → classify → aggregate; chat
  container.ts        composition root: the only place where concrete classes are chosen
  worker.ts           entry point for Cloudflare Workers
  gotFetch.ts         fetch-based replacement for the got library in the Worker bundle
  cli.ts, collect.ts  console entry points
web/                  React + Vite: "Collect + chat", "Reviews", "Analytics", "Settings"
data/sample-reviews.json  demo reviews for the fallback
wrangler.jsonc        Cloudflare Worker configuration
```

Dependencies point inwards: `AnalysisService` knows only the `ReviewSource` and `LlmClient` interfaces. That is why the tests swap the LLM for a fake, a new source (App Store, CSV) is added as a new class, and the move from disk to KV touched only `container.ts` and `worker.ts`.

## Deliberately outside the MVP

- **Jira.** Only the ticket payload is built (shown in the UI next to every top problem); the API is not called.
- **Embeddings.** Grouping follows fixed categories. Clustering with embeddings is the next step, to find topics inside a category.
- **Refusal fallback.** If the model refuses to process a batch, the reviews get the fallback classification; a server-side `fallbacks` to another model is not wired up.
- **Database and multi-user mode.** The latest analysis of an app is shared by all visitors.
