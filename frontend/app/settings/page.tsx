"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ErrorBox, Loading } from "@/components/Status";

const PLACEHOLDER = `{
  "mcpServers": {
    "google-workspace": {
      "command": "uvx",
      "args": ["--python", "3.12", "workspace-mcp", "--tool-tier", "core", "--single-user"],
      "env": {
        "GOOGLE_OAUTH_CLIENT_ID": "",
        "GOOGLE_OAUTH_CLIENT_SECRET": ""
      }
    }
  }
}`;

export default function SettingsPage() {
  const [models, setModels] = useState<{
    models: Record<string, string>;
    configured: boolean;
  } | null>(null);
  const [mcp, setMcp] = useState<{
    ok: boolean;
    tools?: { name: string; description?: string }[];
    error?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api<{ models: Record<string, string>; configured: boolean }>("/models"),
      api<{
        ok: boolean;
        tools?: { name: string; description?: string }[];
        error?: string;
      }>("/mcp/status"),
    ])
      .then(([m, s]) => {
        setModels(m);
        setMcp(s);
      })
      .catch((e) => setError(e.message));
  }, []);

  async function connect() {
    setFormError(null);
    setNotice(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(settings);
    } catch {
      setFormError("Settings are not valid JSON");
      return;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      setFormError("Settings must be a JSON object");
      return;
    }
    setBusy(true);
    try {
      const result = await api<{ ok: boolean; name: string; tools: number }>(
        "/mcp/config",
        { method: "POST", body: JSON.stringify({ settings: parsed }) },
      );
      setSettings("");
      setNotice(
        result.ok
          ? `Connected ${result.name}. ${result.tools} tools are available.`
          : `Saved ${result.name}, but the MCP process did not stay up.`,
      );
      const status = await api<{
        ok: boolean;
        tools?: { name: string; description?: string }[];
        error?: string;
      }>("/mcp/status");
      setMcp(status);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Connect failed");
    } finally {
      setBusy(false);
    }
  }

  if (error) return <ErrorBox message={error} />;
  if (!models || !mcp) return <Loading />;

  return (
    <>
      <h1>Settings</h1>
      <p className="muted">Model map is read-only. Paste MCP settings below to connect.</p>

      <div className="panel">
        <h2>AI models</h2>
        <p>
          Gateway configured:{" "}
          <span className={`badge ${models.configured ? "ok" : "critical"}`}>
            {models.configured ? "yes" : "no"}
          </span>
        </p>
        <ul>
          {Object.entries(models.models).map(([role, id]) => (
            <li key={role}>
              <strong>{role}</strong>: <span className="mono">{id}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="panel">
        <h2>Connect MCP</h2>
        <p className="muted">
          Paste Cursor MCP JSON. The app sends it to the bridge, which stores
          the env values on its private volume and reconnects. Send and write
          tools stay blocked.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void connect();
          }}
        >
          <div className="field">
            <label htmlFor="mcp-settings">MCP settings</label>
            <textarea
              id="mcp-settings"
              name="mcp-settings"
              aria-label="MCP settings JSON"
              spellCheck={false}
              autoComplete="off"
              placeholder={PLACEHOLDER}
              style={{ minHeight: 220 }}
              value={settings}
              onChange={(event) => setSettings(event.target.value)}
            />
          </div>
          {formError && <ErrorBox message={formError} />}
          {notice && <p role="status">{notice}</p>}
          <button
            type="submit"
            className="primary"
            disabled={busy || !settings.trim()}
            aria-label="Connect MCP"
          >
            {busy ? "Connecting…" : "Connect"}
          </button>
        </form>
      </div>

      <div className="panel">
        <h2>MCP bridge</h2>
        <p>
          Status:{" "}
          <span className={`badge ${mcp.ok ? "ok" : "critical"}`}>
            {mcp.ok ? "connected" : "down"}
          </span>
        </p>
        {mcp.error && <p className="muted">{mcp.error}</p>}
        <h2>Tools ({mcp.tools?.length || 0})</h2>
        <ul>
          {(mcp.tools || []).map((t) => (
            <li key={t.name} className="mono">
              {t.name}
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
