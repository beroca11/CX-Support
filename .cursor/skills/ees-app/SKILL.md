---
name: ees-app
description: >-
  Build and run the Executive Escalation System frontend, backend, Postgres,
  and mcp-bridge with Docker Compose. Use when creating or changing the EES
  app, API, UI, database, bridge, Dockerfile, or compose file, or when the user
  mentions docker, frontend, backend, cases, notes, picklists, or AI tasks.
---

# EES app

Build only the slice the user asked for. Case investigation, drafts, notes, and
picklist behavior live in [ees-case](../ees-case/SKILL.md).

## Layout

| Path | Role |
| --- | --- |
| `frontend/` | Next.js App Router UI on port 3000 |
| `backend/` | Hono API on port 4000 |
| `backend/src/db/schema.sql` | Postgres schema |
| `mcp-bridge/` | Python FastAPI bridge to workspace-mcp on port 8100 |
| `docker-compose.yml` | `db`, `mcp-bridge`, `backend`, `frontend` |
| `.env.example` | `DATABASE_URL`, `PORT`, `NEXT_PUBLIC_API_URL`, `AI_GATEWAY_API_KEY`, model map, `MCP_BRIDGE_URL`, `EES_PICKLIST_SHEET_ID` |

Compose services:

- `db`: `postgres:16`, volume `ees_pg`, healthcheck `pg_isready`
- `mcp-bridge`: build `./mcp-bridge`, ports `8100` and `8000` (OAuth), mounts `~/.config/google-workspace-mcp`
- `backend`: build `./backend`, depends on healthy `db`, port `4000:4000`
- `frontend`: build `./frontend`, depends on `backend`, port `3000:3000`

`DATABASE_URL` inside compose uses hostname `db`. The API container waits until Postgres is healthy, then applies `schema.sql` before listening.

## Case API

| Method | Path | Behavior |
| --- | --- | --- |
| `GET` | `/health` | `{ ok: true }` |
| `GET` `POST` | `/cases` | List and create |
| `POST` | `/cases/classify` | AI intake suggestion |
| `GET` `PATCH` | `/cases/:id` | Read and update fields |
| `PUT` | `/cases/:id/investigation` | Replace the brief |
| `POST` | `/cases/:id/notes` | Append a note |
| `GET` `POST` | `/cases/:id/communications` | List and save a draft |
| `GET` `PUT` | `/cases/:id/resolution` | Resolution form |
| `GET` | `/cases/:id/evidence` | Prefetched evidence summaries |
| `GET` | `/cases/:id/ai-runs` | Token/cost log |
| `POST` | `/cases/:id/ai/investigate` | Prefetch + reason brief |
| `POST` | `/cases/:id/ai/draft` | Copy-ready Slack/email/note |
| `POST` | `/cases/:id/ai/resolution` | Fill resolution form |
| `GET` | `/picklists` | All lists |
| `PUT` | `/picklists/:name` | Replace one list |
| `POST` | `/picklists/sync` | Replace lists from the sheet, or the example sheet when no id is set |
| `GET` | `/models` | Model map + gateway configured |
| `GET` | `/mcp/status` | Bridge health + tools |
| `POST` | `/mcp/config` | Paste MCP JSON; bridge stores it and reconnects |

Ids look like `EES-2026-0001`. Severity, status, case type, product, region, and root cause must belong to the current picklist. Field list: [reference.md](reference.md).

## Change workflow

1. Update schema, API, then the screen that uses it.
2. `docker compose up --build` and hit `/health`, then the changed route.
3. Check the case list and the case screen still load after a data-shape change.
4. Stop with `docker compose down`. Do not remove volumes unless the user asks.

## Skipped until asked

Auth, file upload, Slack read adapter inside the bridge, and outbound send from the app.
