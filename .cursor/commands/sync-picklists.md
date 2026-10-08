---
name: sync-picklists
description: Refresh EES picklists from the configured Google Sheet
---

Follow `.cursor/skills/ees-case/SKILL.md`, section Picklists.

Call `POST /picklists/sync` on the API. When `EES_PICKLIST_SHEET_ID` is set, that reads `Picklists!A:C`. Until a live sheet id is set, the source is the example sheet `backend/src/db/picklists.example.csv`. Report the source and how many active values landed in each list. Do not write back to the Sheet.
