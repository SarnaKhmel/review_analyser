import { z } from "zod";
import { CATEGORIES, INTENSITIES, SENTIMENTS, SEVERITIES } from "../types";

export const classificationSchema = z.object({
  sentiment: z.enum(SENTIMENTS),
  category: z.enum(CATEGORIES),
  severity: z.enum(SEVERITIES),
  intensity: z.enum(INTENSITIES),
  topic: z.string(),
});

/** One LLM response covers a whole batch; `index` ties a result back to its review. */
export const batchSchema = z.object({
  results: z.array(classificationSchema.extend({ index: z.number() })),
});

export type BatchResult = z.infer<typeof batchSchema>;

/** Second pass: each group merges the topics at `indexes` under one common `label`. */
export const topicGroupsSchema = z.object({
  groups: z.array(z.object({ label: z.string(), indexes: z.array(z.number()) })),
});
