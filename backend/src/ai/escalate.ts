import type { z } from "zod";
import { genObject, type ModelRole } from "./provider.js";

/**
 * Try MODEL_FAST first; on schema/validation failure or low confidence, retry with MODEL_REASON.
 */
export async function escalateObject<T extends z.ZodType>(opts: {
  schema: T;
  system: string;
  prompt: string;
  confidence?: (obj: z.infer<T>) => number;
  threshold?: number;
  maxOutputTokens?: number;
}): Promise<{
  object: z.infer<T>;
  usage: { inputTokens?: number; outputTokens?: number };
  model: string;
  escalated: boolean;
}> {
  const threshold = opts.threshold ?? 0.6;
  try {
    const fast = await genObject({
      role: "fast",
      schema: opts.schema,
      system: opts.system,
      prompt: opts.prompt,
      maxOutputTokens: opts.maxOutputTokens,
    });
    const conf = opts.confidence?.(fast.object) ?? 1;
    if (conf >= threshold) {
      return { ...fast, escalated: false };
    }
  } catch {
    // fall through to reason
  }

  const reason = await genObject({
    role: "reason" as ModelRole,
    schema: opts.schema,
    system: opts.system,
    prompt: opts.prompt,
    maxOutputTokens: opts.maxOutputTokens,
  });
  return { ...reason, escalated: true };
}
