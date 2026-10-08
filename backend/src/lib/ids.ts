import { query } from "../db/client.js";

export async function nextCaseId(): Promise<string> {
  const year = new Date().getFullYear();
  const result = await query<{ seq: number }>(
    `INSERT INTO case_counters (year, seq) VALUES ($1, 1)
     ON CONFLICT (year) DO UPDATE SET seq = case_counters.seq + 1
     RETURNING seq`,
    [year],
  );
  const seq = result.rows[0].seq;
  return `EES-${year}-${String(seq).padStart(4, "0")}`;
}

export function noteId(): string {
  return `note_${crypto.randomUUID().slice(0, 8)}`;
}

export function commId(): string {
  return `comm_${crypto.randomUUID().slice(0, 8)}`;
}

export function runId(): string {
  return `run_${crypto.randomUUID().slice(0, 8)}`;
}
