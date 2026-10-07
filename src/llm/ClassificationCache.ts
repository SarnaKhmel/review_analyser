import { createHash } from "node:crypto";
import { z } from "zod";
import type { Classification } from "../types";
import { FileStore, type TextStore } from "../storage/TextStore";
import { classificationSchema } from "./schema";

const cacheFileSchema = z.record(z.string(), classificationSchema);

/**
 * JSON cache keyed by a hash of the review text, so the same text never hits the LLM twice.
 * `scope` names the model: results of one model are not reused for another.
 */
export class ClassificationCache {
  private entries = new Map<string, Classification>();
  private loaded = false;

  private readonly store: TextStore;

  /** A string is the path of a local JSON file. */
  constructor(store: string | TextStore) {
    this.store = typeof store === "string" ? new FileStore(store) : store;
  }

  static keyFor(text: string, scope = ""): string {
    return createHash("sha256").update(`${scope}\n${text.trim().toLowerCase()}`).digest("hex");
  }

  async get(text: string, scope?: string): Promise<Classification | undefined> {
    await this.load();
    return this.entries.get(ClassificationCache.keyFor(text, scope));
  }

  async set(text: string, classification: Classification, scope?: string): Promise<void> {
    await this.load();
    this.entries.set(ClassificationCache.keyFor(text, scope), classification);
  }

  async save(): Promise<void> {
    await this.store.write(JSON.stringify(Object.fromEntries(this.entries)));
  }

  private async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const parsed = cacheFileSchema.parse(JSON.parse((await this.store.read()) ?? ""));
      this.entries = new Map(Object.entries(parsed));
    } catch {
      // Missing or corrupted cache: start empty, it is only a cache.
    }
  }
}
