const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, data.error || res.statusText);
  }
  return data as T;
}

export type Case = {
  id: string;
  title: string;
  customer: string;
  executiveSponsor: string;
  owner: string;
  severity: string;
  status: string;
  caseType: string;
  product: string;
  region: string;
  summary: string;
  intake: string;
  alias: string;
  openedAt: string;
  updatedAt: string;
};

export type Note = {
  id: string;
  caseId: string;
  body: string;
  author: string;
  createdAt: string;
};

export type Communication = {
  id: string;
  caseId: string;
  channel: string;
  status: string;
  to: string;
  subject: string;
  body: string;
  kind: string;
  externalId: string | null;
  createdAt: string;
  canUndo?: boolean;
};

export type Investigation = {
  summary: string;
  facts: { text: string; source: string }[];
  timeline: { at: string; event: string; source: string }[];
  openQuestions: { question: string; owner: string }[];
  rootCauseHypothesis?: string;
  recommendedFix?: string;
  fixSource?: string;
  pattern?: string;
  precedents?: { text: string; source: string }[];
  agentActions?: string[];
  updatedAt: string;
};

export type Resolution = {
  issueSummary: string;
  rootCause: string;
  resolutionSummary: string;
  actionsTaken: string[];
  customerSummary: string;
  status: string;
  updatedAt: string;
};

export type AiRun = {
  id: string;
  task: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  steps: number;
  ok: boolean;
  error: string | null;
  createdAt: string;
};

export type CaseDetail = {
  case: Case;
  notes: Note[];
  communications: Communication[];
  investigation: Investigation | null;
  resolution: Resolution | null;
  aiRuns: AiRun[];
  evidence: {
    sourceId: string;
    kind: string;
    title: string;
    date: string;
    summary: string;
    snippet: string;
    fetchedAt: string;
  }[];
};
