import { Hono } from "hono";
import { z } from "zod";
import { query } from "../db/client.js";
import { nextCaseId, noteId, commId } from "../lib/ids.js";
import { assertPicklist } from "../lib/picklists.js";
import {
  mapCase,
  mapNote,
  mapComm,
  type CaseRow,
  type NoteRow,
  type CommRow,
} from "../lib/mappers.js";
import { hasAiKey } from "../ai/provider.js";
import { classifyIntake } from "../ai/tasks/classify.js";
import {
  draftAll,
  draftArtifact,
  isPlainRemoval,
  reviseEmailSelection,
  undoDraftEdit,
  type DraftKind,
} from "../ai/tasks/draft.js";
import { generateResolution } from "../ai/tasks/resolution.js";
import { investigateCase } from "../ai/tasks/investigate.js";

const createSchema = z.object({
  title: z.string().min(1),
  customer: z.string().default(""),
  executiveSponsor: z.string().default(""),
  owner: z.string().default(""),
  severity: z.string().default("High"),
  status: z.string().default("New"),
  caseType: z.string().default("Other"),
  product: z.string().default(""),
  region: z.string().default(""),
  summary: z.string().default(""),
  intake: z.string().default(""),
  alias: z.string().default(""),
});

const patchSchema = createSchema.partial();

export const cases = new Hono();

cases.post("/classify", async (c) => {
  if (!hasAiKey())
    return c.json({ error: "AI_GATEWAY_API_KEY not configured" }, 503);
  const body = z
    .object({ text: z.string().min(1) })
    .safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.message }, 400);
  try {
    return c.json({ suggestion: await classifyIntake(body.data.text) });
  } catch (e) {
    return c.json(
      { error: e instanceof Error ? e.message : String(e) },
      500,
    );
  }
});

cases.get("/", async (c) => {
  const result = await query<CaseRow>(
    `SELECT * FROM cases ORDER BY updated_at DESC`,
  );
  return c.json({ cases: result.rows.map(mapCase) });
});

cases.post("/", async (c) => {
  const body = createSchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.message }, 400);

  const d = body.data;
  for (const [name, value, optional] of [
    ["severity", d.severity, false],
    ["status", d.status, false],
    ["caseType", d.caseType, false],
    ["product", d.product, true],
    ["region", d.region, true],
    ["intake", d.intake, true],
  ] as const) {
    const err = await assertPicklist(name, value, { optional });
    if (err) return c.json({ error: err }, 400);
  }

  const id = await nextCaseId();
  const result = await query<CaseRow>(
    `INSERT INTO cases (id, title, customer, executive_sponsor, owner, severity, status, case_type, product, region, summary, intake, alias)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [
      id,
      d.title,
      d.customer,
      d.executiveSponsor,
      d.owner,
      d.severity,
      d.status,
      d.caseType,
      d.product,
      d.region,
      d.summary,
      d.intake,
      d.alias,
    ],
  );
  console.log(JSON.stringify({ caseId: id, action: "create" }));
  return c.json({ case: mapCase(result.rows[0]) }, 201);
});

cases.get("/:id", async (c) => {
  const id = c.req.param("id");
  const result = await query<CaseRow>(`SELECT * FROM cases WHERE id = $1`, [id]);
  if (!result.rows[0]) return c.json({ error: "Case not found" }, 404);

  const [notes, comms, inv, res, runs, evidence] = await Promise.all([
    query<NoteRow>(
      `SELECT * FROM notes WHERE case_id = $1 ORDER BY created_at ASC`,
      [id],
    ),
    query<CommRow>(
      `SELECT * FROM communications WHERE case_id = $1 ORDER BY created_at DESC`,
      [id],
    ),
    query(
      `SELECT summary, facts, timeline, open_questions, root_cause_hypothesis, recommended_fix, fix_source, pattern, precedents, agent_actions, updated_at
       FROM investigations WHERE case_id = $1`,
      [id],
    ),
    query(
      `SELECT issue_summary, root_cause, resolution_summary, actions_taken, customer_summary, status, updated_at
       FROM resolutions WHERE case_id = $1`,
      [id],
    ),
    query(
      `SELECT id, task, model, input_tokens, output_tokens, duration_ms, steps, ok, error, created_at
       FROM ai_runs WHERE case_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [id],
    ),
    query(
      `SELECT source_id, kind, title, date, content_hash, summary, snippet, fetched_at
       FROM evidence WHERE case_id = $1 ORDER BY fetched_at DESC`,
      [id],
    ),
  ]);

  const invRow = inv.rows[0] as
    | {
        summary: string;
        facts: unknown;
        timeline: unknown;
        open_questions: unknown;
        root_cause_hypothesis: string;
        recommended_fix: string;
        fix_source: string;
        pattern: string;
        precedents: unknown;
        agent_actions: unknown;
        updated_at: Date;
      }
    | undefined;

  const resRow = res.rows[0] as
    | {
        issue_summary: string;
        root_cause: string;
        resolution_summary: string;
        actions_taken: unknown;
        customer_summary: string;
        status: string;
        updated_at: Date;
      }
    | undefined;

  return c.json({
    case: mapCase(result.rows[0]),
    notes: notes.rows.map(mapNote),
    communications: comms.rows.map(mapComm),
    investigation: invRow
      ? {
          summary: invRow.summary,
          facts: invRow.facts,
          timeline: invRow.timeline,
          openQuestions: invRow.open_questions,
          rootCauseHypothesis: invRow.root_cause_hypothesis,
          recommendedFix: invRow.recommended_fix || "",
          fixSource: invRow.fix_source || "",
          pattern: invRow.pattern || "",
          precedents: invRow.precedents || [],
          agentActions: invRow.agent_actions || [],
          updatedAt: invRow.updated_at.toISOString(),
        }
      : null,
    resolution: resRow
      ? {
          issueSummary: resRow.issue_summary,
          rootCause: resRow.root_cause,
          resolutionSummary: resRow.resolution_summary,
          actionsTaken: resRow.actions_taken,
          customerSummary: resRow.customer_summary,
          status: resRow.status,
          updatedAt: resRow.updated_at.toISOString(),
        }
      : null,
    aiRuns: runs.rows.map((r) => ({
      id: r.id,
      task: r.task,
      model: r.model,
      inputTokens: r.input_tokens,
      outputTokens: r.output_tokens,
      durationMs: r.duration_ms,
      steps: r.steps,
      ok: r.ok,
      error: r.error,
      createdAt: (r.created_at as Date).toISOString(),
    })),
    evidence: evidence.rows.map((e) => ({
      sourceId: e.source_id,
      kind: e.kind,
      title: e.title,
      date: e.date,
      contentHash: e.content_hash,
      summary: e.summary,
      snippet: e.snippet,
      fetchedAt: (e.fetched_at as Date).toISOString(),
    })),
  });
});

cases.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = patchSchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.message }, 400);
  const d = body.data;

  const existing = await query<CaseRow>(`SELECT * FROM cases WHERE id = $1`, [
    id,
  ]);
  if (!existing.rows[0]) return c.json({ error: "Case not found" }, 404);

  const checks: [string, string | undefined, boolean][] = [
    ["severity", d.severity, false],
    ["status", d.status, false],
    ["caseType", d.caseType, false],
    ["product", d.product, true],
    ["region", d.region, true],
    ["intake", d.intake, true],
  ];
  for (const [name, value, optional] of checks) {
    if (value === undefined) continue;
    const err = await assertPicklist(name, value, { optional });
    if (err) return c.json({ error: err }, 400);
  }

  const cur = existing.rows[0];
  const result = await query<CaseRow>(
    `UPDATE cases SET
       title = $2, customer = $3, executive_sponsor = $4, owner = $5,
       severity = $6, status = $7, case_type = $8, product = $9, region = $10,
       summary = $11, intake = $12, alias = $13, updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [
      id,
      d.title ?? cur.title,
      d.customer ?? cur.customer,
      d.executiveSponsor ?? cur.executive_sponsor,
      d.owner ?? cur.owner,
      d.severity ?? cur.severity,
      d.status ?? cur.status,
      d.caseType ?? cur.case_type,
      d.product ?? cur.product,
      d.region ?? cur.region,
      d.summary ?? cur.summary,
      d.intake ?? cur.intake,
      d.alias ?? cur.alias,
    ],
  );
  console.log(JSON.stringify({ caseId: id, action: "patch" }));
  return c.json({ case: mapCase(result.rows[0]) });
});

cases.put("/:id/investigation", async (c) => {
  const id = c.req.param("id");
  const schema = z.object({
    summary: z.string().default(""),
    facts: z
      .array(z.object({ text: z.string(), source: z.string() }))
      .default([]),
    timeline: z
      .array(
        z.object({
          at: z.string(),
          event: z.string(),
          source: z.string(),
        }),
      )
      .default([]),
    openQuestions: z
      .array(z.object({ question: z.string(), owner: z.string().default("") }))
      .default([]),
    rootCauseHypothesis: z.string().default(""),
  });
  const body = schema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.message }, 400);

  const exists = await query(`SELECT 1 FROM cases WHERE id = $1`, [id]);
  if (!exists.rows[0]) return c.json({ error: "Case not found" }, 404);

  const d = body.data;
  await query(
    `INSERT INTO investigations (case_id, summary, facts, timeline, open_questions, root_cause_hypothesis, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,NOW())
     ON CONFLICT (case_id) DO UPDATE SET
       summary = EXCLUDED.summary,
       facts = EXCLUDED.facts,
       timeline = EXCLUDED.timeline,
       open_questions = EXCLUDED.open_questions,
       root_cause_hypothesis = EXCLUDED.root_cause_hypothesis,
       updated_at = NOW()`,
    [
      id,
      d.summary,
      JSON.stringify(d.facts),
      JSON.stringify(d.timeline),
      JSON.stringify(d.openQuestions),
      d.rootCauseHypothesis,
    ],
  );
  console.log(JSON.stringify({ caseId: id, action: "investigation" }));
  return c.json({
    investigation: {
      ...d,
      updatedAt: new Date().toISOString(),
    },
  });
});

cases.post("/:id/notes", async (c) => {
  const id = c.req.param("id");
  const schema = z.object({
    body: z.string().min(1),
    author: z.string().default(""),
  });
  const body = schema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.message }, 400);

  const exists = await query(`SELECT 1 FROM cases WHERE id = $1`, [id]);
  if (!exists.rows[0]) return c.json({ error: "Case not found" }, 404);

  const nid = noteId();
  const result = await query<NoteRow>(
    `INSERT INTO notes (id, case_id, body, author) VALUES ($1,$2,$3,$4) RETURNING *`,
    [nid, id, body.data.body, body.data.author],
  );
  console.log(JSON.stringify({ caseId: id, action: "note" }));
  return c.json({ note: mapNote(result.rows[0]) }, 201);
});

cases.get("/:id/communications", async (c) => {
  const id = c.req.param("id");
  const result = await query<CommRow>(
    `SELECT * FROM communications WHERE case_id = $1 ORDER BY created_at DESC`,
    [id],
  );
  return c.json({ communications: result.rows.map(mapComm) });
});

cases.post("/:id/communications", async (c) => {
  const id = c.req.param("id");
  const schema = z.object({
    channel: z.enum(["email", "slack"]),
    to: z.string().default(""),
    subject: z.string().default(""),
    body: z.string().default(""),
    kind: z.string().default(""),
    status: z.enum(["draft", "sent"]).default("draft"),
    externalId: z.string().nullable().optional(),
  });
  const body = schema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.message }, 400);

  const exists = await query(`SELECT 1 FROM cases WHERE id = $1`, [id]);
  if (!exists.rows[0]) return c.json({ error: "Case not found" }, 404);

  const d = body.data;
  const cid = commId();
  const result = await query<CommRow>(
    `INSERT INTO communications (id, case_id, channel, status, "to", subject, body, kind, external_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [
      cid,
      id,
      d.channel,
      d.status,
      d.to,
      d.subject,
      d.body,
      d.kind,
      d.externalId ?? null,
    ],
  );
  console.log(JSON.stringify({ caseId: id, action: "communication" }));
  return c.json({ communication: mapComm(result.rows[0]) }, 201);
});

cases.patch("/:id/communications/:commId", async (c) => {
  const id = c.req.param("id");
  const commIdParam = c.req.param("commId");
  const body = z
    .object({ status: z.literal("sent") })
    .safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.message }, 400);

  const result = await query<CommRow>(
    `UPDATE communications SET status = 'sent'
     WHERE id = $1 AND case_id = $2 AND status = 'draft'
     RETURNING *`,
    [commIdParam, id],
  );
  if (!result.rows[0]) {
    return c.json({ error: "Draft not found" }, 404);
  }
  console.log(JSON.stringify({ caseId: id, action: "communication_sent" }));
  return c.json({ communication: mapComm(result.rows[0]) });
});

cases.post("/:id/communications/:commId/undo", async (c) => {
  const id = c.req.param("id");
  const commIdParam = c.req.param("commId");
  try {
    return c.json(await undoDraftEdit(id, commIdParam));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const status = /not found|cannot be revised|nothing to undo/i.test(message) ? 400 : 500;
    return c.json({ error: message }, status);
  }
});

cases.get("/:id/resolution", async (c) => {
  const id = c.req.param("id");
  const result = await query(
    `SELECT issue_summary, root_cause, resolution_summary, actions_taken, customer_summary, status, updated_at
     FROM resolutions WHERE case_id = $1`,
    [id],
  );
  if (!result.rows[0]) return c.json({ resolution: null });
  const r = result.rows[0];
  return c.json({
    resolution: {
      issueSummary: r.issue_summary,
      rootCause: r.root_cause,
      resolutionSummary: r.resolution_summary,
      actionsTaken: r.actions_taken,
      customerSummary: r.customer_summary,
      status: r.status,
      updatedAt: (r.updated_at as Date).toISOString(),
    },
  });
});

cases.put("/:id/resolution", async (c) => {
  const id = c.req.param("id");
  const schema = z.object({
    issueSummary: z.string().default(""),
    rootCause: z.string().default(""),
    resolutionSummary: z.string().default(""),
    actionsTaken: z.array(z.string()).default([]),
    customerSummary: z.string().default(""),
    status: z.string().default(""),
  });
  const body = schema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.message }, 400);

  const exists = await query(`SELECT 1 FROM cases WHERE id = $1`, [id]);
  if (!exists.rows[0]) return c.json({ error: "Case not found" }, 404);

  const d = body.data;
  if (d.rootCause) {
    const err = await assertPicklist("rootCause", d.rootCause, {
      optional: true,
    });
    if (err) return c.json({ error: err }, 400);
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
      id,
      d.issueSummary,
      d.rootCause,
      d.resolutionSummary,
      JSON.stringify(d.actionsTaken),
      d.customerSummary,
      d.status,
    ],
  );
  console.log(JSON.stringify({ caseId: id, action: "resolution" }));
  return c.json({
    resolution: { ...d, updatedAt: new Date().toISOString() },
  });
});

cases.get("/:id/evidence", async (c) => {
  const id = c.req.param("id");
  const result = await query(
    `SELECT source_id, kind, title, date, content_hash, summary, snippet, fetched_at
     FROM evidence WHERE case_id = $1 ORDER BY fetched_at DESC`,
    [id],
  );
  return c.json({
    evidence: result.rows.map((e) => ({
      sourceId: e.source_id,
      kind: e.kind,
      title: e.title,
      date: e.date,
      contentHash: e.content_hash,
      summary: e.summary,
      snippet: e.snippet,
      fetchedAt: (e.fetched_at as Date).toISOString(),
    })),
  });
});

cases.get("/:id/ai-runs", async (c) => {
  const id = c.req.param("id");
  const result = await query(
    `SELECT id, task, model, input_tokens, output_tokens, duration_ms, steps, ok, error, created_at
     FROM ai_runs WHERE case_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [id],
  );
  return c.json({
    aiRuns: result.rows.map((r) => ({
      id: r.id,
      task: r.task,
      model: r.model,
      inputTokens: r.input_tokens,
      outputTokens: r.output_tokens,
      durationMs: r.duration_ms,
      steps: r.steps,
      ok: r.ok,
      error: r.error,
      createdAt: (r.created_at as Date).toISOString(),
    })),
  });
});

cases.post("/:id/ai/classify", async (c) => {
  if (!hasAiKey())
    return c.json({ error: "AI_GATEWAY_API_KEY not configured" }, 503);
  const id = c.req.param("id");
  const body = z
    .object({ text: z.string().min(1) })
    .safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.message }, 400);
  try {
    return c.json({ suggestion: await classifyIntake(body.data.text, id) });
  } catch (e) {
    return c.json(
      { error: e instanceof Error ? e.message : String(e) },
      500,
    );
  }
});

cases.post("/:id/ai/investigate", async (c) => {
  if (!hasAiKey())
    return c.json({ error: "AI_GATEWAY_API_KEY not configured" }, 503);
  try {
    return c.json(await investigateCase(c.req.param("id")));
  } catch (e) {
    return c.json(
      { error: e instanceof Error ? e.message : String(e) },
      500,
    );
  }
});

cases.post("/:id/ai/draft", async (c) => {
  if (!hasAiKey())
    return c.json({ error: "AI_GATEWAY_API_KEY not configured" }, 503);
  const id = c.req.param("id");
  const body = z
    .object({
      kind: z
        .enum(["exec_slack", "customer_email", "case_note", "all"])
        .default("all"),
    })
    .safeParse(await c.req.json().catch(() => ({ kind: "all" })));
  if (!body.success) return c.json({ error: body.error.message }, 400);
  try {
    if (body.data.kind === "all") {
      return c.json({ results: await draftAll(id) });
    }
    return c.json({
      draft: await draftArtifact(id, body.data.kind as DraftKind),
    });
  } catch (e) {
    return c.json(
      { error: e instanceof Error ? e.message : String(e) },
      500,
    );
  }
});

cases.post("/:id/ai/revise", async (c) => {
  const id = c.req.param("id");
  const body = z
    .object({
      communicationId: z.string().min(1),
      selection: z.string().min(1),
      start: z.number().int().nonnegative().default(0),
      instruction: z.string().min(1),
      remove: z.boolean().optional(),
    })
    .safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.message }, 400);
  const dropping = body.data.remove || isPlainRemoval(body.data.instruction);
  if (!dropping && !hasAiKey()) {
    return c.json({ error: "AI_GATEWAY_API_KEY not configured" }, 503);
  }
  try {
    return c.json(await reviseEmailSelection(id, body.data));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const status = /not found|no longer|cannot be revised|highlighted text/i.test(
      message,
    )
      ? 400
      : 500;
    return c.json({ error: message }, status);
  }
});

cases.post("/:id/ai/resolution", async (c) => {
  if (!hasAiKey())
    return c.json({ error: "AI_GATEWAY_API_KEY not configured" }, 503);
  try {
    return c.json({
      resolution: await generateResolution(c.req.param("id")),
    });
  } catch (e) {
    return c.json(
      { error: e instanceof Error ? e.message : String(e) },
      500,
    );
  }
});
