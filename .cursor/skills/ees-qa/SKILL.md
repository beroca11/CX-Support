---
name: ees-qa
description: >-
  Test the Executive Escalation System and report bugs with a suggested fix.
  Use when the user asks to QA, test, review, hunt bugs, or decide if EES is
  ready to ship. Runs scripts/qa-smoke.sh and the senior-engineer checklist.
---

# EES QA

You are reviewing a case-investigation app: Next.js UI, Hono API, Postgres, Python MCP bridge. Drafts are copy-ready. The app does not send Gmail or Slack. Do not invent customer facts while testing.

## Run

From the repo root, with the stack already up:

```bash
scripts/qa-smoke.sh
```

API base is `http://localhost:4000`. UI base is `http://localhost:3000`. Override with `API` and `UI`.

If `/health` is not `{ "ok": true }`, report **Do not ship** and stop. Do not run `docker compose down -v`.

## What a pass means

- Smoke script exits 0.
- Creating a case with an unknown severity returns 400.
- A created case round-trips: note, investigation, draft communication, resolution.
- AI routes return 503 when `AI_GATEWAY_API_KEY` is empty, and do not crash the API.
- `/`, `/cases/new`, `/cases/:id`, `/picklists`, `/settings` return 200.
- Logs do not contain email bodies, OAuth tokens, or the gateway key.

## Manager checklist

Read the code when the script cannot prove the behavior.

| Risk | Look here |
| --- | --- |
| Unknown picklist accepted | `backend/src/lib/picklists.ts`, case create/patch |
| Fact cites a source that was never fetched | `backend/src/ai/tasks/investigate.ts` `validateSources` |
| Sent draft can be overwritten | communications insert path |
| Bridge exposes send/write tools | `mcp-bridge/bridge/mcp_session.py` `ALLOW` |
| Secrets in compose or logs | `docker-compose.yml`, `console.log` in `backend/src` |
| UI has no empty, loading, or error state | `frontend/app/**/page.tsx` |
| Copy control missing on a draft | `frontend/components/CopyBlock.tsx`, case drafts tab |
| Prefetch runs tools one-by-one | `mcp-bridge/bridge/prefetch.py` |

Severity:

- **P0** — data loss, secret leak, wrong customer content sent or stored as fact, API down.
- **P1** — a main workflow fails (create, investigate, draft, resolution) or a bad picklist is saved.
- **P2** — edge state missing, slow path, confusing copy. Ship allowed if called out.

## Report

```markdown
# EES QA

**Call:** Ship | Ship with follow-ups | Do not ship
**Smoke:** pass | fail (exit N)
**Stack:** API … / UI … / bridge …

## Defects
### P1 — short title
- Evidence: command or `file:line`
- Impact: what the user hits
- Fix: one concrete change

## Checked and fine
- …

## Not verified
- …
```

Suggest the fix. Do not apply it unless the user asks in the same request.
