import { afterEach, describe, expect, it, vi } from "vitest";
import { listModels, OpenAiCompatibleClient, parseJson, recommendModel } from "../src/llm/OpenAiCompatibleClient";

const review = { id: "r1", text: "It crashes", score: 1, date: "2026-01-01T00:00:00.000Z" };

function stubFetch(status: number, body: unknown) {
  const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
    new Response(typeof body === "string" ? body : JSON.stringify(body), { status }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const completion = (content: string) => ({ choices: [{ message: { content } }] });

afterEach(() => vi.unstubAllGlobals());

describe("OpenAiCompatibleClient", () => {
  it("posts to /chat/completions with the model and key, and parses the JSON answer", async () => {
    const fetchMock = stubFetch(200, completion('{"results":[{"index":0}]}'));
    const client = new OpenAiCompatibleClient("http://localhost:11434/v1", "my-model", "secret");

    expect(await client.classifyBatch([review])).toEqual({ results: [{ index: 0 }] });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://localhost:11434/v1/chat/completions");
    expect((init!.headers as Record<string, string>).Authorization).toBe("Bearer secret");
    expect(JSON.parse(init!.body as string)).toMatchObject({
      model: "my-model",
      response_format: { type: "json_object" },
    });
  });

  it("sends no Authorization header without a key", async () => {
    const fetchMock = stubFetch(200, completion("OK"));
    await new OpenAiCompatibleClient("http://localhost:11434/v1", "m").answer("system", "ping");

    expect(fetchMock.mock.calls[0]![1]!.headers).not.toHaveProperty("Authorization");
  });

  it("returns null for output that is not JSON, so the classifier can retry", async () => {
    stubFetch(200, completion("Sure! Here are the results"));
    const client = new OpenAiCompatibleClient("http://x/v1", "m");

    expect(await client.classifyBatch([review])).toBeNull();
  });

  it("turns provider errors into readable messages without leaking the key", async () => {
    stubFetch(401, { error: "bad key secret" });
    const client = new OpenAiCompatibleClient("http://x/v1", "m", "secret");

    await expect(client.answer("s", "q")).rejects.toThrow("відхилив ключ");
  });

  it("reports an unexpected response shape", async () => {
    stubFetch(200, { hello: "world" });

    await expect(new OpenAiCompatibleClient("http://x/v1", "m").answer("s", "q")).rejects.toThrow(
      "неочікуваному форматі",
    );
  });
});

describe("JSON mode failures", () => {
  it("asks again as plain text when the provider rejects the request in JSON mode", async () => {
    const responses = [
      new Response('{"error":{"code":"json_validate_failed"}}', { status: 400 }),
      new Response(JSON.stringify(completion('{"results":[]}')), { status: 200 }),
    ];
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => responses.shift()!);
    vi.stubGlobal("fetch", fetchMock);

    expect(await new OpenAiCompatibleClient("http://x/v1", "m").classifyBatch([review])).toEqual({
      results: [],
    });
    expect(JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)).toHaveProperty("response_format");
    expect(JSON.parse(fetchMock.mock.calls[1]![1]!.body as string)).not.toHaveProperty("response_format");
  });

  it("still reports the error when plain text fails too", async () => {
    stubFetch(400, "model does not exist");

    await expect(new OpenAiCompatibleClient("http://x/v1", "m").classifyBatch([review])).rejects.toThrow(
      "помилкою 400",
    );
  });
});

describe("rate limits", () => {
  it("waits as long as Retry-After says and retries after a 429", async () => {
    const responses = [
      new Response("slow down", { status: 429, headers: { "retry-after": "0" } }),
      new Response(JSON.stringify(completion("OK")), { status: 200 }),
    ];
    const fetchMock = vi.fn(async () => responses.shift()!);
    vi.stubGlobal("fetch", fetchMock);

    expect(await new OpenAiCompatibleClient("http://x/v1", "m").answer("s", "q")).toBe("OK");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("listModels", () => {
  it("returns sorted model ids from /models", async () => {
    const fetchMock = stubFetch(200, { data: [{ id: "b-model" }, { id: "a-model" }] });

    expect(await listModels("http://x/v1/", "secret")).toEqual(["a-model", "b-model"]);
    expect(fetchMock.mock.calls[0]![0]).toBe("http://x/v1/models");
  });

  it("explains when the provider has no model list", async () => {
    stubFetch(200, { hello: "world" });

    await expect(listModels("http://x/v1")).rejects.toThrow("не віддав список моделей");
  });
});

describe("recommendModel", () => {
  const models = ["whisper-large-v3", "small-7b", "vendor/big-120b", "vendor/guard-200b", "mid-27b"];

  it("skips non-chat models and prefers the largest one that answers", async () => {
    stubFetch(200, completion("OK"));

    expect(await recommendModel("http://x/v1", undefined, models)).toBe("vendor/big-120b");
  });

  it("moves on to the next candidate when one does not answer", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      JSON.parse(init!.body as string).model === "vendor/big-120b"
        ? new Response("no access", { status: 403 })
        : new Response(JSON.stringify(completion("OK")), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    expect(await recommendModel("http://x/v1", undefined, models)).toBe("mid-27b");
  });

  it("returns null when nothing answers", async () => {
    stubFetch(500, "down");

    expect(await recommendModel("http://x/v1", undefined, models)).toBeNull();
  });
});

describe("parseJson", () => {
  it("unwraps a Markdown code fence", () => {
    expect(parseJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
});
