---
name: ees-case
description: >-
  Prepare executive escalation investigations, email and Slack drafts, case
  notes, resolution forms, and picklists. Prefer the EES app AI endpoints;
  fall back to Google Workspace and Slack MCP when the app is down.
---

# EES case work

EES is a Coinbase Support team under Executive Escalation Support, the highest support tier at Coinbase. Write drafts for that audience.

Prefer the running app (http://localhost:4000). Load MCP tool schemas with
GetDynamicTools only when falling back to Cursor MCP. Persist results through
the backend API from [ees-app](../ees-app/SKILL.md). Record shapes are in
[reference.md](../ees-app/reference.md).

If the case id is missing, ask for it or the email subject before searching.

## Investigation (preferred)

This is the ground work. The brief should leave the agent with nothing left to research.

1. Ensure the case exists (`GET /cases/:id`).
2. `POST /cases/:id/ai/investigate` — read the account from Gmail, name the pattern that caused the issue, then keep searching Drive and prior cases until a documented fix or precedent is cited.
3. Show the brief: summary, pattern, precedents, `recommendedFix`, `fixSource`, and any agent action still open. Facts cite `gmail:` / `drive:` / `note:` / `case:` sources. A fix with no `drive:` source is dropped. When the pattern and the fix are both sourced, agent actions are empty.

## Investigation (fallback when API/bridge is down)

1. Search Gmail with `search_gmail_messages`. Open hits with `get_gmail_message_content` (batch max 25).
2. Search Drive with `search_drive_files`. Read Docs with `get_doc_content`.
3. Draft the brief and `PUT /cases/:id/investigation` when the API is up.

## Email and Slack

1. `POST /cases/:id/ai/draft` with `kind` `exec_slack`, `customer_email`, `case_note`, or `all`.
2. Show copy-ready blocks. Do not send from the app.
3. Customer email opening depends on case `intake` and whether a customer email is already `sent`:
   - Exec, Prosumer, or Jordan (also when intake is blank): `Hello {Name},` then `I am {Alias} from Executive Escalation Team, we are currently reviewing your case on {issue}.` Alias is the case alias, then owner. Use `[Alias]` when both are empty. Use the customer's first name only when the case or mail states it.
   - HBR or Social Escalation: `A member of our team reach out related to your reported {issue}`
   - Already sent: do not use those greetings. Start with `Thank you for your patience.` or the closest thank-you for what the customer last sent.
   - Close with a signature. When an alias or owner is set: `Regards,` / `{Alias}` / `Coinbase Escalation Support`. When neither is set: `Regards,` / `Coinbase Support`.
4. To edit a draft, highlight a passage in the Exec Slack update or the customer email. A note field opens on it. `POST /cases/:id/ai/revise` with the draft `communicationId`, the highlighted `selection`, its `start` offset, and the agent's `instruction`. The highlight is the reference and the note is the intent. A local note rewrites that passage, including its structure and tone. Remove, or a note that only says to remove or delete the highlight, drops that passage and leaves the rest of the draft. Undo, or Command+Z when the cursor is not in a text field, restores the previous draft text. A note that asks to change the whole draft rewrites that draft. Embedded skills in `backend/src/ai/skills/` ride along: `writing` is always on, `email` or `slack` matches the draft, and naming a skill in the note pulls that skill in too. The note overrides a skill when they conflict. Facts must already be in the draft or the case sources. It does not regenerate the other draft or the case note.
5. If the user insists on Cursor-side send after confirming exact text, use `send_gmail_message` or `slack_send_message` (hook will ask again). Prefer paste. Mark the draft sent with `PATCH /cases/:id/communications/:commId` `{ "status": "sent" }` after it has gone out, so the next draft uses the thank-you opening.

## Resolution form

1. `POST /cases/:id/ai/resolution` or manual `PUT /cases/:id/resolution`.
2. Show case number, issue, root cause, resolution, actions, status, customer summary.
3. Copy into Salesforce / ticketing as the user requests.

## Case notes

Append with `POST /cases/:id/notes`, or draft one with `kind` `case_note`. One note, one purpose. Do not edit prior notes.

A complaint note uses this shape, and only this shape:

```
Form Submission (Complaint Requirements)

Issue: {2-3 sentences on the customer's issue}

Resolution: {1-3 sentences on the resolution, or what is confirmed when no fix is documented yet}

Initial Support Case #: {the current support case number, or the previously active case number}
```

Use a cited support case number. When the mail has none, use the EES case id.

## Picklists

Read lists from `GET /picklists`. Use only active values.

When the user asks to sync, `POST /picklists/sync`. That reads `EES_PICKLIST_SHEET_ID` range `Picklists!A:C` when the id is set. Until then it loads the example sheet `backend/src/db/picklists.example.csv` (same headers: `list`, `value`, `active`). The example includes `intake`: Exec, Prosumer, Jordan, HBR, Social Escalation. Replace only the lists present in the sheet. Do not write back to the Sheet.

## MCP map (fallback)

| Need | Tool |
| --- | --- |
| Find mail | `search_gmail_messages` |
| Read mail | `get_gmail_message_content` |
| Find files | `search_drive_files` |
| Read a Doc | `get_doc_content` |
| Read picklists | `read_sheet_values` |
| Prefetch via bridge | `POST http://localhost:8100/prefetch/case` |
