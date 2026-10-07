import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/** Where a cache keeps its single JSON document: a local file, or Workers KV when deployed. */
export interface TextStore {
  /** Undefined when nothing has been written yet. */
  read(): Promise<string | undefined>;
  write(text: string): Promise<void>;
}

export class FileStore implements TextStore {
  constructor(private readonly filePath: string) {}

  async read(): Promise<string | undefined> {
    try {
      return await readFile(this.filePath, "utf8");
    } catch {
      return undefined;
    }
  }

  async write(text: string): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, text);
  }
}

/** The part of a Workers KV namespace the app uses. */
export type KvNamespace = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
};

export class KvStore implements TextStore {
  constructor(
    private readonly kv: KvNamespace,
    private readonly key: string,
  ) {}

  async read(): Promise<string | undefined> {
    return (await this.kv.get(this.key)) ?? undefined;
  }

  async write(text: string): Promise<void> {
    await this.kv.put(this.key, text);
  }
}
