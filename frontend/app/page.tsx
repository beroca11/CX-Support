"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, type Case } from "@/lib/api";
import { Empty, ErrorBox, Loading } from "@/components/Status";

export default function HomePage() {
  const [cases, setCases] = useState<Case[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ cases: Case[] }>("/cases")
      .then((d) => setCases(d.cases))
      .catch((e) => setError(e.message));
  }, []);

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h1>Cases</h1>
          <p className="muted">Executive escalations end to end.</p>
        </div>
        <Link href="/cases/new">
          <button type="button" className="primary" aria-label="Create new case">
            New case
          </button>
        </Link>
      </div>

      {error && <ErrorBox message={error} />}
      {!error && !cases && <Loading />}
      {cases && cases.length === 0 && (
        <Empty label="No cases yet. Create one to start an investigation." />
      )}
      {cases && cases.length > 0 && (
        <div className="panel" style={{ padding: 0, overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th scope="col">ID</th>
                <th scope="col">Title</th>
                <th scope="col">Customer</th>
                <th scope="col">Severity</th>
                <th scope="col">Status</th>
                <th scope="col">Updated</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/cases/${c.id}`}>{c.id}</Link>
                  </td>
                  <td>{c.title}</td>
                  <td>{c.customer || "—"}</td>
                  <td>
                    <span className={`badge ${c.severity}`}>{c.severity}</span>
                  </td>
                  <td>{c.status}</td>
                  <td className="muted">
                    {new Date(c.updatedAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
