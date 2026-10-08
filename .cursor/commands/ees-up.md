---
name: ees-up
description: Build and start the EES frontend, backend, and database
---

Follow `.cursor/skills/ees-app/SKILL.md`.

From the project root, run `docker compose up --build`. Wait until `GET http://localhost:4000/health` returns `{ "ok": true }` and http://localhost:3000 responds. Report both URLs. Leave the stack running.
