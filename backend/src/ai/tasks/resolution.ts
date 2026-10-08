import { z } from "zod";
import { genObject } from "../provider.js";
import { recordRun, usageTokens } from "../runs.js";
import { query } from "../../db/client.js";
import { mapCase, type CaseRow } from "../../lib/mappers.js";
import { assertPicklist, activeValues } from "../../lib/picklists.js";

const schema = z.object({
  issueSummary: z.string(),
  rootCause: z.string().default(""),
  resolutionSummary: z.string(),
  actionsTaken: z.array(z.string()).default([]),
  customerSummary: z.string(),
  status: z.string(),
});

export async function generateResolution(caseId: string) {
  const caseResult = await query<CaseRow>(`SELECT * FROM cases WHERE id = $1`, [
    caseId,
  ]);
  if (!caseResult.rows[0]) throw new Error("Case not found");

  const [inv, notes, rootCauses, statuses] = await Promise.all([
    query(
      `SELECT summary, facts, timeline, open_questions, root_cause_hypothesis, recommended_fix, fix_source FROM investigations WHERE case_id = $1`,
      [caseId],
    ),
    query(
      `SELECT body FROM notes WHERE case_id = $1 ORDER BY created_at DESC LIMIT 15`,
      [caseId],
    ),
    activeValues("rootCause"),
    activeValues("status"),
  ]);

  const system = `Fill a resolution form for an executive escalation.
Case number is ${caseId}.
rootCause must be one of: ${rootCauses.join(", ") || "(free text if empty list)"}.
status should be one of: ${statuses.filter((s) => ["Resolved", "Closed", "Pending Customer", "Pending Internal"].includes(s)).join(", ") || "Resolved"}.
issueSummary = what the issue was. resolutionSummary = how it was fixed. customerSummary = short customer-facing summary.
If investigation.recommended_fix is set, resolutionSummary and actionsTaken must follow that knowledge-base fix and cite investigation.fix_source. Do not invent a different remedy.
Only use provided facts. Do not invent.`;

  const prompt = JSON.stringify(
    {
      case: mapCase(caseResult.rows[0]),
      investigation: inv.rows[0] ?? null,
      notes: notes.rows,
    },
    null,
    2,
  );

  const started = Date.now();
  try {
    const result = await genObject({
      role: "write",
      schema,
      system,
      prompt,
      maxOutputTokens: 1500,
    });
    const tokens = usageTokens(result.usage);
    await recordRun({
      caseId,
      task: "resolution",
      model: result.model,
      inputTokens: tokens.input,
      outputTokens: tokens.output,
      durationMs: Date.now() - started,
      steps: 1,
      ok: true,
    });

    const d = result.object;
    if (d.rootCause && rootCauses.length > 0) {
      const err = await assertPicklist("rootCause", d.rootCause, {
        optional: true,
      });
      if (err) d.rootCause = "";
    }

    await query(
      `INSERT INTO resolutions (case_id, issue_summary, root_cause, resolution_summary, actions_taken, customer_summary, status, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
       ON CONFLICT (case_id) DO UPDATE SET
         issue_summary = EXCLUDED.issue_summary,
         root_cause = EXCLUDED.root_cause,
         resolution_summary = EXCLUDED.resolution_summary,
         actions_taken = EXCLUDED.actions_taken,
         customer_summary = EXCLUDED.customer_summary,
         status = EXCLUDED.status,
         updated_at = NOW()`,
      [
        caseId,
        d.issueSummary,
        d.rootCause,
        d.resolutionSummary,
        JSON.stringify(d.actionsTaken),
        d.customerSummary,
        d.status,
      ],
    );

    return {
      ...d,
      caseNumber: caseId,
      updatedAt: new Date().toISOString(),
      copy: {
        plain: [
          `Case: ${caseId}`,
          `Issue: ${d.issueSummary}`,
          `Root cause: ${d.rootCause}`,
          `Resolution: ${d.resolutionSummary}`,
          `Actions: ${d.actionsTaken.join("; ")}`,
          `Status: ${d.status}`,
          `Customer summary: ${d.customerSummary}`,
        ].join("\n"),
        markdown: [
          `## Resolution — ${caseId}`,
          `**Issue:** ${d.issueSummary}`,
          `**Root cause:** ${d.rootCause}`,
          `**Resolution:** ${d.resolutionSummary}`,
          `**Actions:**`,
          ...d.actionsTaken.map((a) => `- ${a}`),
          `**Status:** ${d.status}`,
          `**Customer summary:** ${d.customerSummary}`,
        ].join("\n"),
        json: { caseNumber: caseId, ...d },
      },
    };
  } catch (e) {
    await recordRun({
      caseId,
      task: "resolution",
      model: "none",
      durationMs: Date.now() - started,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}
