"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppNav from "@/app/components/AppNav";
import ThemeToggle from "@/app/components/ThemeToggle";

interface Account {
  id: string;
  name: string;
  institution: string;
}

const PRESETS = [
  { id: "auto", label: "Auto-detect columns" },
  { id: "america-first", label: "America First Credit Union" },
  { id: "mountain-america", label: "Mountain America Credit Union" },
];

interface ImportResult {
  rowCount: number;
  imported: number;
  skipped: number;
  detectedColumns?: Record<string, string>;
  error?: string;
}

export default function ImportPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState("");
  const [preset, setPreset] = useState("auto");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  useEffect(() => {
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((a: Account[]) => {
        setAccounts(a);
        if (a[0]) setAccountId(a[0].id);
      });
  }, []);

  async function upload() {
    if (!file || !accountId) return;
    setBusy(true);
    setResult(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("accountId", accountId);
    fd.append("preset", preset);
    const res = await fetch("/api/import", { method: "POST", body: fd });
    const data = await res.json();
    setResult(data);
    setBusy(false);
  }

  return (
    <>
      <header className="topbar">
        <h1>💰 Budget</h1>
        <div className="header-actions">
          <ThemeToggle />
          <AppNav />
        </div>
      </header>

      <div className="container" style={{ maxWidth: 640 }}>
        <h2>Import transactions from a CSV</h2>
        <p className="muted">
          Log in to your bank, export your transactions as a CSV for a date
          range, then upload the file here. Duplicates are skipped automatically,
          so overlapping exports are safe.
        </p>

        <div className="card">
          <h3>Upload</h3>
          <div className="form-grid" style={{ flexDirection: "column", alignItems: "stretch" }}>
            <label className="field">
              Account
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} — {a.institution}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              Bank format
              <select value={preset} onChange={(e) => setPreset(e.target.value)}>
                {PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              CSV file
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>

            <button onClick={upload} disabled={busy || !file || !accountId}>
              {busy ? "Importing…" : "Import"}
            </button>
          </div>
        </div>

        {result && (
          <div className="card" style={{ marginTop: 20 }}>
            <h3>{result.error ? "Import failed" : "Import complete"}</h3>
            <div style={{ padding: 16 }}>
              {result.error ? (
                <p style={{ color: "var(--red)" }}>{result.error}</p>
              ) : (
                <>
                  <p>
                    <span className="pill">{result.imported} imported</span>{" "}
                    <span className="pill">{result.skipped} skipped (duplicates)</span>{" "}
                    <span className="muted">of {result.rowCount} rows</span>
                  </p>
                  {result.detectedColumns && (
                    <p className="muted">
                      Detected columns:{" "}
                      {Object.entries(result.detectedColumns)
                        .map(([k, v]) => `${k}=${v}`)
                        .join(", ")}
                    </p>
                  )}
                  <Link href="/">← Back to dashboard</Link>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
