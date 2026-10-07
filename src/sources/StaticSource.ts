import type { Review } from "../types";
import type { ReviewSource } from "./ReviewSource";

/** Reviews that are already in memory: the demo data bundled into the Worker, which has no disk. */
export class StaticSource implements ReviewSource {
  constructor(private readonly reviews: Review[]) {}

  async fetch(): Promise<Review[]> {
    return this.reviews;
  }
}
