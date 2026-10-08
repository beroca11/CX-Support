---
name: draft-case-email
description: Draft an escalation email or Slack message and wait for confirmation
---

Follow `.cursor/skills/ees-case/SKILL.md`, section Email and Slack.

Draft only. Save a `draft` communication on the case and show the recipients, subject, and body. Do not call `send_gmail_message` or `slack_send_message` in this command.

Opening: Exec, Prosumer, or Jordan starts with `Hello {Name},` and `I am {Alias} from Executive Escalation Team, we are currently reviewing your case on {issue}.` HBR or Social Escalation starts with `A member of our team reach out related to your reported {issue}`. If a customer email on this case is already sent, skip both and start with `Thank you for your patience.` or the closest thank-you.

Signature: with an alias, `Regards,` then the alias, then `Coinbase Escalation Support`. With no alias, `Regards,` then `Coinbase Support`.
