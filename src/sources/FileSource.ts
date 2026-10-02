import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { Review } from "../types";
import type { ReviewSource } from "./ReviewSource";

const reviewsFileSchema = z.array(
  z.object({
    id: z.string(),
    text: z.string(),
    score: z.number().int().min(1).max(5),
    date: z.string(),
  }),
);

/** Reads reviews from a local JSON file. Used as the fallback source and for offline demos. */
export class FileSource implements ReviewSource {
  constructor(private readonly filePath: string) {}

  async fetch(): Promise<Review[]> {
    const raw = await readFile(this.filePath, "utf8");
    return reviewsFileSchema.parse(JSON.parse(raw));
  }
}
