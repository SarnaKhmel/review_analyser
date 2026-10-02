import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { UserError } from "../errors";
import type { Review } from "../types";
import type { LlmClient } from "./LlmClient";
import {
  buildClassifyMessage,
  buildGroupTopicsMessage,
  CLASSIFY_SYSTEM_PROMPT,
  GROUP_TOPICS_SYSTEM_PROMPT,
  type TopicItem,
} from "./prompts";
import { batchSchema, topicGroupsSchema } from "./schema";

export class ClaudeClient implements LlmClient {
  private anthropic?: Anthropic;

  /** Without `apiKey` the SDK reads ANTHROPIC_API_KEY from the environment. */
  constructor(
    private readonly model: string,
    private readonly apiKey?: string,
  ) {}

  /** Created on first use, so a missing key is a readable error and not a crash at startup. */
  private get client(): Anthropic {
    if (!this.apiKey && !process.env.ANTHROPIC_API_KEY) {
      throw new UserError(
        "ШІ не налаштовано: підключіть свою на вкладці «Налаштування» або додайте ANTHROPIC_API_KEY у .env на сервері",
        500,
      );
    }
    return (this.anthropic ??= new Anthropic(this.apiKey ? { apiKey: this.apiKey } : {}));
  }

  async classifyBatch(reviews: Review[]): Promise<unknown> {
    const response = await this.client.messages.parse({
      model: this.model,
      max_tokens: 8000,
      system: CLASSIFY_SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildClassifyMessage(reviews) }],
      output_config: {
        // Classification is a simple task: low effort is cheaper and faster.
        effort: "low",
        // Structured output: the API constrains the response to this JSON schema.
        format: zodOutputFormat(batchSchema),
      },
    });
    // null when the model refused or the output was cut off — the caller treats it as invalid.
    return response.parsed_output;
  }

  async groupTopics(items: TopicItem[]): Promise<unknown> {
    const response = await this.client.messages.parse({
      model: this.model,
      max_tokens: 8000,
      system: GROUP_TOPICS_SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildGroupTopicsMessage(items) }],
      output_config: { effort: "low", format: zodOutputFormat(topicGroupsSchema) },
    });
    return response.parsed_output;
  }

  async answer(system: string, question: string): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4000,
      system,
      messages: [{ role: "user", content: question }],
      output_config: { effort: "low" },
    });
    return response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();
  }
}
