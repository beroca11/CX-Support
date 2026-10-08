"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Empty, ErrorBox, Loading } from "@/components/Status";

type Picklists = Record<string, { value: string; active: boolean }[]>;

export default function PicklistsPage() {
  const [picklists, setPicklists] = useState<Picklists | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("product");
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncNote, setSyncNote] = useState("");

  function load() {
    api<{ picklists: Picklists }>("/picklists")
      .then((d) => setPicklists(d.picklists))
      .catch((e) => setError(e.message));
  }

  useEffect(() => {
    load();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const values = raw
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((line) => {
          const inactive = line.startsWith("!");
          return {
            value: inactive ? line.slice(1).trim() : line,
            active: !inactive,
          };
        });
      await api(`/picklists/${name}`, {
        method: "PUT",
        body: JSON.stringify({ values }),
      });
      load();
      setRaw("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function sync() {
    setSyncing(true);
    setError(null);
    setSyncNote("");
    try {
      const res = await api<{
        source: string;
        counts: Record<string, number>;
        picklists: Picklists;
      }>("/picklists/sync", { method: "POST" });
      setPicklists(res.picklists);
      const counts = Object.entries(res.counts)
        .map(([list, n]) => `${list} ${n}`)
        .join(", ");
      setSyncNote(
        res.source === "sheet"
          ? `Synced from the sheet. Active values: ${counts}.`
          : `Synced from the example sheet. Active values: ${counts}.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSyncing(false);
    }
  }

  return (
    <>
      <h1>Picklists</h1>
      <p className="muted">
        Controlled values. Prefix a line with ! to mark inactive. Sync reads
        the example sheet until a live sheet id is set.
      </p>
      <button
        type="button"
        className="primary"
        onClick={sync}
        disabled={syncing}
        aria-label="Sync picklists from the sheet"
      >
        {syncing ? "Syncing…" : "Sync from sheet"}
      </button>
      {syncNote && <p>{syncNote}</p>}
      {error && <ErrorBox message={error} />}
      {!picklists && !error && <Loading />}
      {picklists && Object.keys(picklists).length === 0 && (
        <Empty label="No picklists." />
      )}
      {picklists &&
        Object.entries(picklists).map(([n, values]) => (
          <div className="panel" key={n}>
            <h2 className="mono">{n}</h2>
            <ul>
              {values.map((v) => (
                <li key={v.value}>
                  {v.value}{" "}
                  {!v.active && <span className="badge">inactive</span>}
                </li>
              ))}
            </ul>
          </div>
        ))}

      <form className="panel" onSubmit={save}>
        <h2>Replace list</h2>
        <div className="field">
          <label htmlFor="name">List name</label>
          <input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Picklist name"
            required
          />
        </div>
        <div className="field">
          <label htmlFor="raw">Values (one per line)</label>
          <textarea
            id="raw"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            aria-label="Picklist values"
            required
          />
        </div>
        <button type="submit" className="primary" disabled={busy}>
          Save list
        </button>
      </form>
    </>
  );
}
