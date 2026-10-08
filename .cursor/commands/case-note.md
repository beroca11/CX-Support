---
name: case-note
description: Append one internal note on an executive escalation case
---

Follow `.cursor/skills/ees-case/SKILL.md`, section Case notes.

Append exactly one note for the case in this message. If the case id is missing, ask before writing. Do not change older notes.

Use this shape:

```
Form Submission (Complaint Requirements)

Issue: {2-3 sentences}

Resolution: {1-3 sentences}

Initial Support Case #: {current case number or the previously active case}
```

Prefer `POST /cases/:id/ai/draft` with `kind` `case_note` when the case already has an investigation. Otherwise write that shape from cited facts only.
