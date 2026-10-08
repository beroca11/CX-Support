# EES records

## Case

`id`, `title`, `customer`, `executiveSponsor`, `owner`, `alias`, `severity`, `status`, `caseType`, `intake`, `product`, `region`, `summary`, `openedAt`, `updatedAt`

`intake` is Exec, Prosumer, Jordan, HBR, or Social Escalation. `alias` is the name used in the customer email.

Default status on create: `New`. Default severity: `High`.

## Investigation

`summary`, `facts[]` (`text`, `source`), `timeline[]` (`at`, `event`, `source`), `openQuestions[]` (`question`, `owner`), `rootCauseHypothesis`, `pattern`, `precedents[]` (`text`, `source`), `recommendedFix`, `fixSource`, `agentActions[]`, `updatedAt`

`source` is a `gmail:<id>`, `drive:<id>`, `note:<id>`, `case:<id>`, or a URL the user supplied. Every fact needs a source that exists in evidence, notes, or a prior case the investigation retrieved.

## Note

`id`, `caseId`, `body`, `author`, `createdAt`. No update or delete routes.

## Communication

`id`, `caseId`, `channel` (`email` or `slack`), `status` (`draft` or `sent`), `to`, `subject`, `body`, `kind` (`exec_slack`, `customer_email`, …), `externalId`, `createdAt`

A `sent` row is immutable. The app saves drafts for copy-paste; it does not send.

## Resolution

`caseId`, `issueSummary`, `rootCause`, `resolutionSummary`, `actionsTaken[]`, `customerSummary`, `status`, `updatedAt`

Copy-ready as plain text, markdown, and JSON for paste into Salesforce or similar.

## Evidence

`caseId`, `sourceId`, `kind`, `title`, `date`, `contentHash`, `summary`, `snippet`, `fetchedAt`

Cached per source; reused when `contentHash` is unchanged.

## AiRun

`id`, `caseId`, `task`, `model`, `inputTokens`, `outputTokens`, `durationMs`, `steps`, `ok`, `error`, `createdAt`

## Picklists

Seed these names: `severity`, `status`, `caseType`, `product`, `region`, `rootCause`.

Seed values:

- severity: Critical, High, Medium
- status: New, Investigating, Pending Customer, Pending Internal, Resolved, Closed
- caseType: Product, Billing, Security, Service, Other
- intake: Exec, Prosumer, Jordan, HBR, Social Escalation
- product, region, rootCause: empty until the user supplies values or a sheet sync

Each value is `{ value, active }`. Inactive values stay on old cases and are rejected on new writes.
