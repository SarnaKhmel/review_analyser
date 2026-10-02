import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { Classification } from "../types";
import { classificationSchema } from "./schema";

const cacheFileSchema = z.record(z.string(), classificationSchema);

/**
 * JSON-file cache keyed by a hash of the review text, so the same text never hits the LLM twice.
 * `scope` names the model: results of one model are not reused for another.
 */
export class ClassificationCache {
  private entries = new Map<string, Classification>();
  private loaded = false;

  constructor(private readonly filePath: string) {}

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
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(Object.fromEntries(this.entries)));
  }

  private async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const parsed = cacheFileSchema.parse(JSON.parse(await readFile(this.filePath, "utf8")));
      this.entries = new Map(Object.entries(parsed));
    } catch {
      // Missing or corrupted cache file: start empty, it is only a cache.
    }
  }
}
