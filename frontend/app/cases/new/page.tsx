"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ErrorBox } from "@/components/Status";

type Picklists = Record<string, { value: string; active: boolean }[]>;

type Suggestion = {
  title: string;
  customer: string;
  caseType: string;
  severity: string;
  product: string;
  region: string;
  summary: string;
  intake?: string;
  identifiers: string[];
  confidence: number;
};

export default function NewCasePage() {
  const router = useRouter();
  const [picklists, setPicklists] = useState<Picklists>({});
  const [intakeText, setIntakeText] = useState("");
  const [title, setTitle] = useState("");
  const [customer, setCustomer] = useState("");
  const [severity, setSeverity] = useState("High");
  const [caseType, setCaseType] = useState("Other");
  const [product, setProduct] = useState("");
  const [region, setRegion] = useState("");
  const [summary, setSummary] = useState("");
  const [owner, setOwner] = useState("");
  const [alias, setAlias] = useState("");
  const [intake, setIntake] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);

  useEffect(() => {
    api<{ picklists: Picklists }>("/picklists")
      .then((d) => setPicklists(d.picklists))
      .catch(() => {});
  }, []);

  const options = (name: string) =>
    (picklists[name] || []).filter((v) => v.active).map((v) => v.value);

  async function classify() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ suggestion: Suggestion }>("/cases/classify", {
        method: "POST",
        body: JSON.stringify({ text: intakeText }),
      });
      const s = res.suggestion;
      setSuggestion(s);
      setTitle(s.title || title);
      setCustomer(s.customer || customer);
      setSeverity(s.severity || severity);
      setCaseType(s.caseType || caseType);
      setProduct(s.product || product);
      setRegion(s.region || region);
      if (s.intake) setIntake(s.intake);
      setSummary(s.summary || summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ case: { id: string } }>("/cases", {
        method: "POST",
        body: JSON.stringify({
          title,
          customer,
          severity,
          caseType,
          product,
          region,
          summary: summary || intakeText,
          owner,
          alias,
          intake,
        }),
      });
      router.push(`/cases/${res.case.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <>
      <h1>New case</h1>
      <p className="muted">Paste intake, optionally classify with AI, then confirm.</p>
      {error && <ErrorBox message={error} />}

      <div className="panel">
        <div className="field">
          <label htmlFor="intake">Intake text</label>
          <textarea
            id="intake"
            value={intakeText}
            onChange={(e) => setIntakeText(e.target.value)}
            placeholder="Paste customer email or describe the issue…"
            aria-label="Intake text"
          />
        </div>
        <button
          type="button"
          onClick={classify}
          disabled={busy || !intakeText.trim()}
          aria-label="Classify intake with AI"
        >
          {busy ? "Working…" : "Suggest with AI"}
        </button>
        {suggestion && (
          <p className="muted" style={{ marginTop: "0.75rem" }}>
            Confidence {(suggestion.confidence * 100).toFixed(0)}%
            {suggestion.identifiers?.length
              ? ` · IDs: ${suggestion.identifiers.join(", ")}`
              : ""}
          </p>
        )}
      </div>

      <form className="panel" onSubmit={create}>
        <div className="field">
          <label htmlFor="title">Title</label>
          <input
            id="title"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="Case title"
          />
        </div>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="customer">Customer</label>
            <input
              id="customer"
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              aria-label="Customer"
            />
          </div>
          <div className="field">
            <label htmlFor="alias">Alias</label>
            <input
              id="alias"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              aria-label="Agent alias for customer email"
              placeholder="Name in the customer email"
            />
          </div>
          <div className="field">
            <label htmlFor="owner">Owner</label>
            <input
              id="owner"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              aria-label="Owner"
            />
          </div>
          <div className="field">
            <label htmlFor="severity">Severity</label>
            <select
              id="severity"
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
              aria-label="Severity"
            >
              {options("severity").map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="intakeSource">Intake</label>
            <select
              id="intakeSource"
              value={intake}
              onChange={(e) => setIntake(e.target.value)}
              aria-label="Intake"
            >
              <option value="">—</option>
              {options("intake").map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="caseType">Case type</label>
            <select
              id="caseType"
              value={caseType}
              onChange={(e) => setCaseType(e.target.value)}
              aria-label="Case type"
            >
              {options("caseType").map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="product">Product</label>
            <select
              id="product"
              value={product}
              onChange={(e) => setProduct(e.target.value)}
              aria-label="Product"
            >
              <option value="">—</option>
              {options("product").map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="region">Region</label>
            <select
              id="region"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              aria-label="Region"
            >
              <option value="">—</option>
              {options("region").map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="summary">Summary</label>
          <textarea
            id="summary"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            aria-label="Summary"
          />
        </div>
        <button type="submit" className="primary" disabled={busy || !title}>
          Create case
        </button>
      </form>
    </>
  );
}
