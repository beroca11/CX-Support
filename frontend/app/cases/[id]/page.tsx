"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type CaseDetail, type Communication } from "@/lib/api";
import { CopyBlock } from "@/components/CopyBlock";
import { Empty, ErrorBox, Loading } from "@/components/Status";

type Tab = "overview" | "investigation" | "drafts" | "resolution" | "activity";

export default function CasePage() {
  const params = useParams();
  const id = String(params.id);
  const [data, setData] = useState<CaseDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [busy, setBusy] = useState<string | null>(null);
  const [noteBody, setNoteBody] = useState("");
  const [lastEdited, setLastEdited] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    return api<CaseDetail>(`/cases/${id}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const undoTarget = useCallback(() => {
    if (!data) return null;
    const drafts = data.communications.filter(
      (item) =>
        item.status === "draft" &&
        item.canUndo &&
        (item.kind === "customer_email" || item.kind === "exec_slack"),
    );
    return drafts.find((item) => item.id === lastEdited)?.id ?? drafts[0]?.id ?? null;
  }, [data, lastEdited]);

  const undo = useCallback(
    (commId: string) => {
      setLastEdited(commId);
      return run("undo", () =>
        api(`/cases/${id}/communications/${commId}/undo`, { method: "POST" }),
      );
    },
    [id],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.key.toLowerCase() !== "z") return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) {
        return;
      }
      const commId = undoTarget();
      if (!commId || busy) return;
      e.preventDefault();
      void undo(commId);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undoTarget, undo, busy]);

  const tokenTotal = useMemo(() => {
    if (!data) return 0;
    return data.aiRuns.reduce(
      (s, r) => s + (r.inputTokens || 0) + (r.outputTokens || 0),
      0,
    );
  }, [data]);

  async function run(action: string, fn: () => Promise<unknown>) {
    setBusy(action);
    setError(null);
    try {
      await fn();
      await load();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(null);
    }
  }

  if (!data && !error) return <Loading label={`Loading ${id}…`} />;
  if (error && !data) return <ErrorBox message={error} />;
  if (!data) return null;

  const cse = data.case;
  const draftsByKind = (kind: string): Communication | undefined =>
    data.communications.find((c) => c.kind === kind);

  const exec = draftsByKind("exec_slack");
  const email = draftsByKind("customer_email");
  const noteDraft = data.notes.filter((n) => n.author === "ees-ai").at(-1);

  const resolutionCopy = data.resolution
    ? [
        `Case: ${cse.id}`,
        `Issue: ${data.resolution.issueSummary}`,
        `Root cause: ${data.resolution.rootCause}`,
        `Resolution: ${data.resolution.resolutionSummary}`,
        `Actions: ${(data.resolution.actionsTaken || []).join("; ")}`,
        `Status: ${data.resolution.status}`,
        `Customer summary: ${data.resolution.customerSummary}`,
      ].join("\n")
    : "";

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <p className="mono muted" style={{ margin: 0 }}>
            {cse.id}
          </p>
          <h1>{cse.title}</h1>
          <div className="row">
            <span className={`badge ${cse.severity}`}>{cse.severity}</span>
            <span className="badge">{cse.status}</span>
            <span className="badge">{cse.caseType}</span>
            {cse.intake && <span className="badge">{cse.intake}</span>}
            <span className="muted">
              Tokens: {tokenTotal.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {error && <ErrorBox message={error} />}

      <div className="tabs" role="tablist" aria-label="Case sections">
        {(
          [
            ["overview", "Overview"],
            ["investigation", "Investigation"],
            ["drafts", "Drafts"],
            ["resolution", "Resolution"],
            ["activity", "Activity"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={tab === key ? "active" : ""}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="panel">
          <h2>Overview</h2>
          <div className="grid-2">
            <p>
              <span className="muted">Customer</span>
              <br />
              {cse.customer || "—"}
            </p>
            <p>
              <span className="muted">Owner</span>
              <br />
              {cse.owner || "—"}
            </p>
            <p>
              <span className="muted">Alias</span>
              <br />
              {cse.alias || cse.owner || "—"}
            </p>
            <p>
              <span className="muted">Intake</span>
              <br />
              {cse.intake || "—"}
            </p>
            <p>
              <span className="muted">Product</span>
              <br />
              {cse.product || "—"}
            </p>
            <p>
              <span className="muted">Region</span>
              <br />
              {cse.region || "—"}
            </p>
          </div>
          <p>
            <span className="muted">Summary</span>
            <br />
            {cse.summary || "—"}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run("note", () =>
                api(`/cases/${id}/notes`, {
                  method: "POST",
                  body: JSON.stringify({ body: noteBody, author: "user" }),
                }).then(() => setNoteBody("")),
              );
            }}
          >
            <div className="field">
              <label htmlFor="note">Add note</label>
              <textarea
                id="note"
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
                aria-label="New note body"
                placeholder={
                  "Form Submission (Complaint Requirements)\n\nIssue: \n\nResolution: \n\nInitial Support Case #: "
                }
              />
            </div>
            <button
              type="submit"
              className="primary"
              disabled={!!busy || !noteBody.trim()}
            >
              Append note
            </button>
          </form>
        </div>
      )}

      {tab === "investigation" && (
        <div className="panel">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2>Investigation</h2>
            <button
              type="button"
              className="primary"
              disabled={!!busy}
              aria-label="Run investigation"
              onClick={() =>
                run("investigate", () =>
                  api(`/cases/${id}/ai/investigate`, { method: "POST" }),
                )
              }
            >
              {busy === "investigate" ? "Investigating…" : "Run investigation"}
            </button>
          </div>
          {!data.investigation && (
            <Empty label="No brief yet. Run investigation to map the account, the pattern, and the documented fix." />
          )}
          {data.investigation && (
            <>
              <p>{data.investigation.summary}</p>
              {data.investigation.rootCauseHypothesis && (
                <p>
                  <strong>Hypothesis:</strong>{" "}
                  {data.investigation.rootCauseHypothesis}
                </p>
              )}
              {data.investigation.pattern && (
                <p>
                  <strong>Pattern:</strong> {data.investigation.pattern}
                </p>
              )}
              {(data.investigation.precedents || []).length > 0 && (
                <>
                  <h2>Precedents</h2>
                  <ul>
                    {(data.investigation.precedents || []).map((p, i) => (
                      <li key={i}>
                        {p.text}{" "}
                        <span className="mono muted">({p.source})</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {data.investigation.recommendedFix ? (
                <p>
                  <strong>Recommended fix:</strong>{" "}
                  {data.investigation.recommendedFix}{" "}
                  {data.investigation.fixSource && (
                    <span className="mono muted">
                      ({data.investigation.fixSource})
                    </span>
                  )}
                </p>
              ) : (
                <p className="muted">
                  No knowledge-base article cited a fix yet.
                </p>
              )}
              {(data.investigation.agentActions || []).length > 0 && (
                <>
                  <h2>Left for the agent</h2>
                  <ul>
                    {(data.investigation.agentActions || []).map((action, i) => (
                      <li key={i}>{action}</li>
                    ))}
                  </ul>
                </>
              )}
              {(data.investigation.agentActions || []).length === 0 &&
                data.investigation.recommendedFix && (
                  <p>
                    Nothing left to research. Draft the case note and the
                    customer email from this brief.
                  </p>
                )}
              <h2>Facts</h2>
              <ul>
                {(data.investigation.facts || []).map((f, i) => (
                  <li key={i}>
                    {f.text}{" "}
                    <span className="mono muted">({f.source})</span>
                  </li>
                ))}
              </ul>
              <h2>Timeline</h2>
              <ul>
                {(data.investigation.timeline || []).map((t, i) => (
                  <li key={i}>
                    <span className="mono">{t.at}</span> — {t.event}{" "}
                    <span className="mono muted">({t.source})</span>
                  </li>
                ))}
              </ul>
              <h2>Open questions</h2>
              <ul>
                {(data.investigation.openQuestions || []).map((q, i) => (
                  <li key={i}>
                    {q.question}
                    {q.owner ? ` — ${q.owner}` : ""}
                  </li>
                ))}
              </ul>
            </>
          )}
          {data.evidence?.length > 0 && (
            <>
              <h2>Evidence ({data.evidence.length})</h2>
              <ul>
                {data.evidence.map((e) => (
                  <li key={e.sourceId}>
                    <span className="mono">{e.sourceId}</span> — {e.title}
                    <br />
                    <span className="muted">{e.summary}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {tab === "drafts" && (
        <div className="panel">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2>Drafts</h2>
            <button
              type="button"
              className="primary"
              disabled={!!busy}
              aria-label="Generate all drafts"
              onClick={() =>
                run("draft", () =>
                  api(`/cases/${id}/ai/draft`, {
                    method: "POST",
                    body: JSON.stringify({ kind: "all" }),
                  }),
                )
              }
            >
              {busy === "draft" ? "Drafting…" : "Generate all drafts"}
            </button>
          </div>
          <p className="muted">
            Copy into Slack, Gmail, Salesforce — the app does not send.
            Highlight a sentence in the Exec Slack update or the customer email.
            The note can restyle that part, break it into paragraphs, or rewrite
            the draft when you ask. The writing skill is built in, and the
            email or Slack skill matches the draft.             Name a skill in the note to
            add another. Remove drops the highlighted text and leaves the rest.
            Undo, or Command+Z, puts that text back. The other draft stays as
            it is. Facts stay tied to the case sources.
          </p>
          <div style={{ display: "grid", gap: "1.25rem" }}>
            {exec?.to && (
              <p className="muted" style={{ margin: 0 }}>
                # {exec.to}
              </p>
            )}
            <CopyBlock
              label="Exec Slack update"
              text={exec?.body || ""}
              copyText={
                exec ? `${exec.to ? `# ${exec.to}\n` : ""}${exec.body}` : ""
              }
              revising={busy === "revise"}
              removing={busy === "remove"}
              onRevise={
                exec?.status === "draft"
                  ? async (selection, instruction, remove) => {
                      const ok = await run(remove ? "remove" : "revise", () =>
                        api(`/cases/${id}/ai/revise`, {
                          method: "POST",
                          body: JSON.stringify({
                            communicationId: exec.id,
                            selection: selection.text,
                            start: selection.start,
                            instruction,
                            remove: !!remove,
                          }),
                        }),
                      );
                      if (ok) setLastEdited(exec.id);
                      return ok;
                    }
                  : undefined
              }
            />
            {exec?.status === "draft" && exec.canUndo && (
              <button
                type="button"
                disabled={!!busy}
                aria-label="Undo the last Exec Slack edit"
                onClick={() => undo(exec.id)}
              >
                {busy === "undo" && lastEdited === exec.id ? "Undoing…" : "Undo"}
              </button>
            )}
            {email?.to && (
              <p className="muted" style={{ margin: 0 }}>
                To: {email.to}
                {email.subject ? ` · ${email.subject}` : ""}
              </p>
            )}
            <CopyBlock
              label="Customer email"
              text={email?.body || ""}
              copyText={
                email
                  ? `To: ${email.to}\nSubject: ${email.subject}\n\n${email.body}`
                  : ""
              }
              revising={busy === "revise"}
              removing={busy === "remove"}
              onRevise={
                email?.status === "draft"
                  ? async (selection, instruction, remove) => {
                      const ok = await run(remove ? "remove" : "revise", () =>
                        api(`/cases/${id}/ai/revise`, {
                          method: "POST",
                          body: JSON.stringify({
                            communicationId: email.id,
                            selection: selection.text,
                            start: selection.start,
                            instruction,
                            remove: !!remove,
                          }),
                        }),
                      );
                      if (ok) setLastEdited(email.id);
                      return ok;
                    }
                  : undefined
              }
            />
            {email?.status === "draft" && email.canUndo && (
              <button
                type="button"
                disabled={!!busy}
                aria-label="Undo the last customer email edit"
                onClick={() => undo(email.id)}
              >
                {busy === "undo" && lastEdited === email.id ? "Undoing…" : "Undo"}
              </button>
            )}
            {email && email.status === "draft" && (
              <button
                type="button"
                disabled={!!busy}
                aria-label="Mark customer email as sent"
                onClick={() =>
                  run("sent", () =>
                    api(`/cases/${id}/communications/${email.id}`, {
                      method: "PATCH",
                      body: JSON.stringify({ status: "sent" }),
                    }),
                  )
                }
              >
                {busy === "sent"
                  ? "Saving…"
                  : "Mark email sent"}
              </button>
            )}
            {email?.status === "sent" && (
              <p className="muted">
                Sent. The next customer email starts with a thank-you.
              </p>
            )}
            <CopyBlock
              label="Case note"
              text={noteDraft?.body || ""}
            />
          </div>
        </div>
      )}

      {tab === "resolution" && (
        <div className="panel">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2>Resolution form</h2>
            <button
              type="button"
              className="primary"
              disabled={!!busy}
              aria-label="Generate resolution form"
              onClick={() =>
                run("resolution", () =>
                  api(`/cases/${id}/ai/resolution`, { method: "POST" }),
                )
              }
            >
              {busy === "resolution" ? "Generating…" : "Generate with AI"}
            </button>
          </div>
          {!data.resolution && (
            <Empty label="No resolution yet. Generate or fill after the investigation." />
          )}
          {data.resolution && (
            <>
              <div className="grid-2">
                <p>
                  <span className="muted">Issue</span>
                  <br />
                  {data.resolution.issueSummary}
                </p>
                <p>
                  <span className="muted">Root cause</span>
                  <br />
                  {data.resolution.rootCause || "—"}
                </p>
                <p>
                  <span className="muted">Resolution</span>
                  <br />
                  {data.resolution.resolutionSummary}
                </p>
                <p>
                  <span className="muted">Status</span>
                  <br />
                  {data.resolution.status}
                </p>
              </div>
              <p>
                <span className="muted">Actions</span>
                <br />
                {(data.resolution.actionsTaken || []).join("; ") || "—"}
              </p>
              <p>
                <span className="muted">Customer summary</span>
                <br />
                {data.resolution.customerSummary}
              </p>
              <CopyBlock label="Copy-ready resolution" text={resolutionCopy} />
            </>
          )}
        </div>
      )}

      {tab === "activity" && (
        <div className="panel">
          <h2>Notes</h2>
          {data.notes.length === 0 && <Empty label="No notes." />}
          <ul>
            {data.notes.map((n) => (
              <li key={n.id}>
                <span className="mono muted">
                  {new Date(n.createdAt).toLocaleString()} · {n.author || "—"}
                </span>
                <div style={{ whiteSpace: "pre-wrap" }}>{n.body}</div>
              </li>
            ))}
          </ul>
          <h2>AI runs</h2>
          {data.aiRuns.length === 0 && <Empty label="No AI runs yet." />}
          <table className="table">
            <thead>
              <tr>
                <th>Task</th>
                <th>Model</th>
                <th>Tokens</th>
                <th>ms</th>
                <th>OK</th>
              </tr>
            </thead>
            <tbody>
              {data.aiRuns.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{r.task}</td>
                  <td className="muted">{r.model}</td>
                  <td>
                    {(r.inputTokens || 0) + (r.outputTokens || 0)}
                  </td>
                  <td>{r.durationMs}</td>
                  <td>
                    <span className={`badge ${r.ok ? "ok" : "critical"}`}>
                      {r.ok ? "ok" : "fail"}
                    </span>
                    {!r.ok && r.error && (
                      <div className="muted">{r.error}</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
