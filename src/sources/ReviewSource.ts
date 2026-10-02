import type { Review } from "../types";

/** Anything that can produce reviews. The rest of the app depends only on this interface. */
export interface ReviewSource {
  fetch(): Promise<Review[]>;
}
