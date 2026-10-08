CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  customer TEXT NOT NULL DEFAULT '',
  executive_sponsor TEXT NOT NULL DEFAULT '',
  owner TEXT NOT NULL DEFAULT '',
  severity TEXT NOT NULL DEFAULT 'High',
  status TEXT NOT NULL DEFAULT 'New',
  case_type TEXT NOT NULL DEFAULT 'Other',
  product TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  intake TEXT NOT NULL DEFAULT '',
  alias TEXT NOT NULL DEFAULT '',
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS investigations (
  case_id TEXT PRIMARY KEY REFERENCES cases(id) ON DELETE CASCADE,
  summary TEXT NOT NULL DEFAULT '',
  facts JSONB NOT NULL DEFAULT '[]',
  timeline JSONB NOT NULL DEFAULT '[]',
  open_questions JSONB NOT NULL DEFAULT '[]',
  root_cause_hypothesis TEXT NOT NULL DEFAULT '',
  recommended_fix TEXT NOT NULL DEFAULT '',
  fix_source TEXT NOT NULL DEFAULT '',
  pattern TEXT NOT NULL DEFAULT '',
  precedents JSONB NOT NULL DEFAULT '[]',
  agent_actions JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE cases ADD COLUMN IF NOT EXISTS intake TEXT NOT NULL DEFAULT '';
ALTER TABLE cases ADD COLUMN IF NOT EXISTS alias TEXT NOT NULL DEFAULT '';

ALTER TABLE investigations ADD COLUMN IF NOT EXISTS recommended_fix TEXT NOT NULL DEFAULT '';
ALTER TABLE investigations ADD COLUMN IF NOT EXISTS fix_source TEXT NOT NULL DEFAULT '';
ALTER TABLE investigations ADD COLUMN IF NOT EXISTS pattern TEXT NOT NULL DEFAULT '';
ALTER TABLE investigations ADD COLUMN IF NOT EXISTS precedents JSONB NOT NULL DEFAULT '[]';
ALTER TABLE investigations ADD COLUMN IF NOT EXISTS agent_actions JSONB NOT NULL DEFAULT '[]';

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS communications (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'slack')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent')),
  "to" TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT '',
  external_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  body_history JSONB NOT NULL DEFAULT '[]'
);

ALTER TABLE communications ADD COLUMN IF NOT EXISTS body_history JSONB NOT NULL DEFAULT '[]';

CREATE TABLE IF NOT EXISTS picklists (
  name TEXT NOT NULL,
  value TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (name, value)
);

CREATE TABLE IF NOT EXISTS resolutions (
  case_id TEXT PRIMARY KEY REFERENCES cases(id) ON DELETE CASCADE,
  issue_summary TEXT NOT NULL DEFAULT '',
  root_cause TEXT NOT NULL DEFAULT '',
  resolution_summary TEXT NOT NULL DEFAULT '',
  actions_taken JSONB NOT NULL DEFAULT '[]',
  customer_summary TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_runs (
  id TEXT PRIMARY KEY,
  case_id TEXT REFERENCES cases(id) ON DELETE SET NULL,
  task TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT '',
  input_tokens INT NOT NULL DEFAULT 0,
  output_tokens INT NOT NULL DEFAULT 0,
  duration_ms INT NOT NULL DEFAULT 0,
  steps INT NOT NULL DEFAULT 0,
  ok BOOLEAN NOT NULL DEFAULT TRUE,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS evidence (
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL DEFAULT '',
  content_hash TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  snippet TEXT NOT NULL DEFAULT '',
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (case_id, source_id)
);

CREATE TABLE IF NOT EXISTS case_counters (
  year INT PRIMARY KEY,
  seq INT NOT NULL DEFAULT 0
);

INSERT INTO picklists (name, value, active) VALUES
  ('severity', 'Critical', TRUE),
  ('severity', 'High', TRUE),
  ('severity', 'Medium', TRUE),
  ('status', 'New', TRUE),
  ('status', 'Investigating', TRUE),
  ('status', 'Pending Customer', TRUE),
  ('status', 'Pending Internal', TRUE),
  ('status', 'Resolved', TRUE),
  ('status', 'Closed', TRUE),
  ('caseType', 'Product', TRUE),
  ('caseType', 'Billing', TRUE),
  ('caseType', 'Security', TRUE),
  ('caseType', 'Service', TRUE),
  ('caseType', 'Other', TRUE),
  ('intake', 'Exec', TRUE),
  ('intake', 'Prosumer', TRUE),
  ('intake', 'Jordan', TRUE),
  ('intake', 'HBR', TRUE),
  ('intake', 'Social Escalation', TRUE)
ON CONFLICT (name, value) DO NOTHING;
