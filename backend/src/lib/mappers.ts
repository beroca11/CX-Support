export type CaseRow = {
  id: string;
  title: string;
  customer: string;
  executive_sponsor: string;
  owner: string;
  severity: string;
  status: string;
  case_type: string;
  product: string;
  region: string;
  summary: string;
  intake: string;
  alias: string;
  opened_at: Date;
  updated_at: Date;
};

export function mapCase(row: CaseRow) {
  return {
    id: row.id,
    title: row.title,
    customer: row.customer,
    executiveSponsor: row.executive_sponsor,
    owner: row.owner,
    severity: row.severity,
    status: row.status,
    caseType: row.case_type,
    product: row.product,
    region: row.region,
    summary: row.summary,
    intake: row.intake || "",
    alias: row.alias || "",
    openedAt: row.opened_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export type NoteRow = {
  id: string;
  case_id: string;
  body: string;
  author: string;
  created_at: Date;
};

export function mapNote(row: NoteRow) {
  return {
    id: row.id,
    caseId: row.case_id,
    body: row.body,
    author: row.author,
    createdAt: row.created_at.toISOString(),
  };
}

export type CommRow = {
  id: string;
  case_id: string;
  channel: string;
  status: string;
  to: string;
  subject: string;
  body: string;
  kind: string;
  external_id: string | null;
  created_at: Date;
  body_history?: unknown;
};

export function mapComm(row: CommRow) {
  return {
    id: row.id,
    caseId: row.case_id,
    channel: row.channel,
    status: row.status,
    to: row.to,
    subject: row.subject,
    body: row.body,
    kind: row.kind,
    externalId: row.external_id,
    createdAt: row.created_at.toISOString(),
    canUndo: Array.isArray(row.body_history) && row.body_history.length > 0,
  };
}
