import { query } from "../db/client.js";
import { runId } from "../lib/ids.js";

export async function recordRun(input: {
  caseId?: string | null;
  task: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  durationMs?: number;
  steps?: number;
  ok?: boolean;
  error?: string | null;
}) {
  const id = runId();
  await query(
    `INSERT INTO ai_runs (id, case_id, task, model, input_tokens, output_tokens, duration_ms, steps, ok, error)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      id,
      input.caseId ?? null,
      input.task,
      input.model,
      input.inputTokens ?? 0,
      input.outputTokens ?? 0,
      input.durationMs ?? 0,
      input.steps ?? 0,
      input.ok ?? true,
      input.error ?? null,
    ],
  );
  return id;
}

export function usageTokens(usage: {
  inputTokens?: number | null;
  outputTokens?: number | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
}) {
  return {
    input: usage.inputTokens ?? usage.promptTokens ?? 0,
    output: usage.outputTokens ?? usage.completionTokens ?? 0,
  };
}
