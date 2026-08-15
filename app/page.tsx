"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { usePlaidLink } from "react-plaid-link";
import { formatCents } from "@/lib/money";

interface Category {
  id: string;
  name: string;
  color: string;
  kind: string;
}
interface Account {
  id: string;
  name: string;
  institution: string;
  _count?: { transactions: number };
}
interface Txn {
  id: string;
  date: string;
  description: string;
  amountCents: number;
  categoryId: string | null;
  category: Category | null;
  account: Account;
  source: string;
}
interface ExpenseRow {
  id: string;
  name: string;
  color: string;
  budgetCents: number;
  spentCents: number;
}
interface Summary {
  expenseRows: ExpenseRow[];
  uncategorizedCents: number;
  totals: {
    incomeCents: number;
    spendingCents: number;
    netCents: number;
    totalBudgetCents: number;
    transfersCents: number;
  };
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function thisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "numeric",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

// Guess a short merchant keyword from a noisy bank description, e.g.
// "VISA - 07/13 MAVERIK #536 EPHRAIM UT 013025" -> "maverik".
const KEYWORD_STOPWORDS = new Set([
  "visa", "pending", "purchase", "pos", "debit", "credit", "card",
  "mobile", "banking", "payment", "transaction", "the", "llc", "inc",
]);
function guessMerchantKeyword(description: string): string {
  let s = description.toLowerCase();
  s = s.replace(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g, " "); // dates
  s = s.replace(/#?\d[\d-]*/g, " "); // numbers / store #s
  s = s.replace(/[*|,.]/g, " ");
  const tokens = s.split(/\s+/).filter(Boolean);
  const good = tokens.filter(
    (t) => t.length >= 3 && !KEYWORD_STOPWORDS.has(t) && /[a-z]/.test(t)
  );
  // First one or two meaningful words tend to be the merchant name.
  return good.slice(0, 2).join(" ").trim() || tokens[0] || "";
}

export default function Home() {
  const [month, setMonth] = useState(thisMonth());
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [a, c, t, s] = await Promise.all([
      fetch("/api/accounts").then((r) => r.json()),
      fetch("/api/categories").then((r) => r.json()),
      fetch(`/api/transactions?month=${month}`).then((r) => r.json()),
      fetch(`/api/summary?month=${month}`).then((r) => r.json()),
    ]);
    setAccounts(a);
    setCategories(c);
    setTxns(t);
    setSummary(s);
    setLoading(false);
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  if (!loading && accounts.length === 0) {
    return <FirstRun onCreated={load} />;
  }

  return (
    <>
      <header className="topbar">
        <h1>💰 Budget</h1>
        <nav>
          <Link href="/">Dashboard</Link>
          <Link href="/reports">Reports</Link>
          <Link href="/import">Import CSV</Link>
          <Link href="/manage">Manage</Link>
        </nav>
      </header>

      <div className="container">
        <div className="month-nav">
          <button className="ghost" onClick={() => setMonth(shiftMonth(month, -1))}>
            ← Prev
          </button>
          <h2>{monthLabel(month)}</h2>
          <button className="ghost" onClick={() => setMonth(shiftMonth(month, 1))}>
            Next →
          </button>
          {month !== thisMonth() && (
            <button className="ghost" onClick={() => setMonth(thisMonth())}>
              Today
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button
            className="ghost"
            title="Apply merchant rules to uncategorized transactions this month"
            onClick={async () => {
              await fetch("/api/recategorize", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ month }),
              });
              load();
            }}
          >
            ↻ Auto-categorize
          </button>
        </div>

        {summary && (
          <div className="totals">
            <div className="stat">
              <div className="label">Income</div>
              <div className="value pos">
                {formatCents(summary.totals.incomeCents)}
              </div>
            </div>
            <div className="stat">
              <div className="label">Spending</div>
              <div className="value neg">
                {formatCents(summary.totals.spendingCents)}
              </div>
            </div>
            <div className="stat">
              <div className="label">Net</div>
              <div
                className={`value ${
                  summary.totals.netCents >= 0 ? "pos" : "neg"
                }`}
              >
                {formatCents(summary.totals.netCents)}
              </div>
              {summary.totals.transfersCents > 0 && (
                <div className="amt" style={{ marginTop: 4 }}>
                  {formatCents(summary.totals.transfersCents)} in transfers
                  (excluded)
                </div>
              )}
            </div>
          </div>
        )}

        <AccountsBar accounts={accounts} onChange={load} />

        <div className="layout">
          <div className="card">
            <h3>Transactions</h3>
            <TxnTable
              txns={txns}
              categories={categories}
              accounts={accounts}
              month={month}
              onChange={load}
            />
          </div>

          {summary && (
            <BudgetPanel
              summary={summary}
              month={month}
              onChange={load}
            />
          )}
        </div>
      </div>
    </>
  );
}

function TxnTable({
  txns,
  categories,
  accounts,
  month,
  onChange,
}: {
  txns: Txn[];
  categories: Category[];
  accounts: Account[];
  month: string;
  onChange: () => void;
}) {
  async function setCategory(id: string, categoryId: string) {
    await fetch(`/api/transactions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId }),
    });
    onChange();
  }
  async function remove(id: string) {
    await fetch(`/api/transactions/${id}`, { method: "DELETE" });
    onChange();
  }
  // Explicitly remember a merchant → category rule for future auto-categorizing.
  async function rememberRule(t: Txn) {
    if (!t.categoryId || !t.category) {
      alert("Pick a category for this row first, then remember it.");
      return;
    }
    const guess = guessMerchantKeyword(t.description);
    const keyword = window.prompt(
      `Auto-categorize future transactions containing this text as "${t.category.name}".\n\n` +
        `Keep it short (a merchant name works best):`,
      guess
    );
    if (keyword === null) return; // cancelled
    const pattern = keyword.trim();
    if (!pattern) return;
    const res = await fetch("/api/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pattern,
        categoryId: t.categoryId,
        applyToExisting: true,
      }),
    });
    const data = await res.json();
    if (data.updated > 0) {
      alert(
        `Saved. "${pattern}" → ${t.category.name}.\nApplied to ${data.updated} existing transaction(s) too.`
      );
    }
    onChange();
  }

  const multiAccount = accounts.length > 1;

  // ---- Filters & sorting (applied to the loaded month) ----
  const [q, setQ] = useState("");
  const [catFilter, setCatFilter] = useState("all"); // all | none | <categoryId>
  const [accFilter, setAccFilter] = useState("all");
  const [minAmt, setMinAmt] = useState("");
  const [maxAmt, setMaxAmt] = useState("");
  const [sortKey, setSortKey] = useState<"date" | "cost" | "company">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function toggleSort(key: "date" | "cost" | "company") {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }
  const arrow = (key: string) =>
    sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const min = minAmt ? Math.round(parseFloat(minAmt) * 100) : null;
    const max = maxAmt ? Math.round(parseFloat(maxAmt) * 100) : null;

    const rows = txns.filter((t) => {
      if (needle && !t.description.toLowerCase().includes(needle)) return false;
      if (catFilter === "none" && t.categoryId) return false;
      if (catFilter !== "all" && catFilter !== "none" && t.categoryId !== catFilter)
        return false;
      if (accFilter !== "all" && t.account?.id !== accFilter) return false;
      const abs = Math.abs(t.amountCents);
      if (min !== null && abs < min) return false;
      if (max !== null && abs > max) return false;
      return true;
    });

    rows.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "date") cmp = a.date.localeCompare(b.date);
      else if (sortKey === "cost")
        cmp = Math.abs(a.amountCents) - Math.abs(b.amountCents);
      else cmp = a.description.localeCompare(b.description);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [txns, q, catFilter, accFilter, minAmt, maxAmt, sortKey, sortDir]);

  const filterActive =
    q || catFilter !== "all" || accFilter !== "all" || minAmt || maxAmt;
  const filteredTotalCents = filtered.reduce(
    (s, t) => s + (t.amountCents < 0 ? -t.amountCents : 0),
    0
  );

  return (
    <>
      <div className="filter-bar">
        <input
          type="text"
          placeholder="Search company…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ minWidth: 150 }}
        />
        <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
          <option value="all">All categories</option>
          <option value="none">Uncategorized</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {multiAccount && (
          <select value={accFilter} onChange={(e) => setAccFilter(e.target.value)}>
            <option value="all">All accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        )}
        <input
          type="text"
          inputMode="decimal"
          placeholder="Min $"
          value={minAmt}
          onChange={(e) => setMinAmt(e.target.value)}
          style={{ width: 70 }}
        />
        <input
          type="text"
          inputMode="decimal"
          placeholder="Max $"
          value={maxAmt}
          onChange={(e) => setMaxAmt(e.target.value)}
          style={{ width: 70 }}
        />
        {filterActive && (
          <button
            className="ghost"
            onClick={() => {
              setQ("");
              setCatFilter("all");
              setAccFilter("all");
              setMinAmt("");
              setMaxAmt("");
            }}
          >
            Clear
          </button>
        )}
        <span className="muted" style={{ marginLeft: "auto" }}>
          {filtered.length} of {txns.length} · spend {formatCents(filteredTotalCents)}
        </span>
      </div>

      <div className="table-wrap">
      <table style={{ minWidth: multiAccount ? 720 : 620 }}>
        <thead>
          <tr>
            <th
              style={{ width: 96, cursor: "pointer" }}
              onClick={() => toggleSort("date")}
            >
              Date{arrow("date")}
            </th>
            <th
              className="num"
              style={{ width: 84, cursor: "pointer" }}
              onClick={() => toggleSort("cost")}
            >
              Cost{arrow("cost")}
            </th>
            <th style={{ cursor: "pointer", minWidth: 140 }} onClick={() => toggleSort("company")}>
              Company{arrow("company")}
            </th>
            {multiAccount && <th style={{ width: 120 }}>Account</th>}
            <th style={{ width: 150 }}>Category</th>
            <th style={{ width: 84 }}></th>
          </tr>
        </thead>
        <tbody>
          <AddRow
            categories={categories}
            accounts={accounts}
            month={month}
            multiAccount={multiAccount}
            onAdded={onChange}
          />
          {filtered.map((t) => (
          <tr key={t.id}>
            <td>{fmtDate(t.date)}</td>
            <td className="num">
              {t.amountCents >= 0 ? (
                <span className="value pos" style={{ fontSize: 14 }}>
                  +{formatCents(t.amountCents).replace("-", "")}
                </span>
              ) : (
                formatCents(-t.amountCents)
              )}
            </td>
            <td>{t.description}</td>
            {multiAccount && (
              <td className="muted" style={{ fontSize: 12 }}>
                {t.account?.name}
              </td>
            )}
            <td>
              <select
                className="cat"
                value={t.categoryId ?? ""}
                onChange={(e) => setCategory(t.id, e.target.value)}
              >
                <option value="">— uncategorized —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </td>
            <td>
              <div className="row-actions">
                <button
                  className="icon"
                  title="Remember this merchant → category for future imports"
                  onClick={() => rememberRule(t)}
                >
                  🔖
                </button>
                <button
                  className="icon"
                  title="Delete"
                  onClick={() => remove(t.id)}
                >
                  ✕
                </button>
              </div>
            </td>
          </tr>
        ))}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={multiAccount ? 6 : 5} className="empty">
                {txns.length === 0
                  ? "No transactions this month. Add one above or import a CSV."
                  : "No transactions match the current filters."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </>
  );
}

function AddRow({
  categories,
  accounts,
  month,
  multiAccount,
  onAdded,
}: {
  categories: Category[];
  accounts: Account[];
  month: string;
  multiAccount: boolean;
  onAdded: () => void;
}) {
  const [date, setDate] = useState(`${month}-01`);
  const [cost, setCost] = useState("");
  const [company, setCompany] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [kind, setKind] = useState("expense");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => setDate(`${month}-01`), [month]);
  useEffect(() => {
    if (!accountId && accounts[0]) setAccountId(accounts[0].id);
  }, [accounts, accountId]);

  async function add() {
    if (!cost || !company) return;
    setBusy(true);
    await fetch("/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountId: accountId || accounts[0]?.id,
        date,
        description: company,
        cost,
        categoryId: categoryId || undefined,
        kind,
      }),
    });
    setCost("");
    setCompany("");
    setCategoryId("");
    setBusy(false);
    onAdded();
  }

  return (
    <tr className="addrow">
      <td>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </td>
      <td>
        <input
          type="text"
          inputMode="decimal"
          placeholder="0.00"
          value={cost}
          onChange={(e) => setCost(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
      </td>
      <td>
        <input
          type="text"
          placeholder="Company"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
      </td>
      {multiAccount && (
        <td>
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </td>
      )}
      <td>
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">auto-categorize</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </td>
      <td>
        <div className="row-actions">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            title="Expense or income"
            style={{ width: 44, padding: "4px 2px" }}
          >
            <option value="expense">−</option>
            <option value="income">+</option>
          </select>
          <button onClick={add} disabled={busy}>
            +
          </button>
        </div>
      </td>
    </tr>
  );
}

function BudgetPanel({
  summary,
  month,
  onChange,
}: {
  summary: Summary;
  month: string;
  onChange: () => void;
}) {
  async function setBudget(categoryId: string, limit: string) {
    await fetch("/api/budgets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month, categoryId, limit }),
    });
    onChange();
  }

  const totalSpent = summary.expenseRows.reduce((s, r) => s + r.spentCents, 0);

  return (
    <div className="card">
      <h3>Budget</h3>
      {summary.expenseRows.map((r) => {
        const pct =
          r.budgetCents > 0
            ? Math.min(100, (r.spentCents / r.budgetCents) * 100)
            : r.spentCents > 0
            ? 100
            : 0;
        const over = r.budgetCents > 0 && r.spentCents > r.budgetCents;
        const remaining = r.budgetCents - r.spentCents;
        return (
          <div key={r.id} className={`budget-row ${over ? "over" : ""}`}>
            <div className="top">
              <span className="name">{r.name}</span>
              <span className="amt">
                {formatCents(r.spentCents).replace("$", "$")} /
                <BudgetInput
                  cents={r.budgetCents}
                  onSave={(v) => setBudget(r.id, v)}
                />
              </span>
            </div>
            <div className="bar">
              <span
                style={{
                  width: `${pct}%`,
                  background: over ? "var(--red)" : r.color,
                }}
              />
            </div>
            <div className="amt" style={{ marginTop: 4 }}>
              {over ? (
                <span style={{ color: "var(--red)" }}>
                  {formatCents(-remaining)} over
                </span>
              ) : (
                <>{formatCents(remaining)} left</>
              )}
            </div>
          </div>
        );
      })}

      {summary.uncategorizedCents > 0 && (
        <div className="budget-row">
          <div className="top">
            <span className="name muted">Uncategorized</span>
            <span className="amt">{formatCents(summary.uncategorizedCents)}</span>
          </div>
        </div>
      )}

      <div className="budget-row" style={{ background: "#f2f7f2" }}>
        <div className="top">
          <span className="name">Total</span>
          <span className="amt">
            <strong>{formatCents(totalSpent)}</strong> /{" "}
            {formatCents(summary.totals.totalBudgetCents)}
          </span>
        </div>
      </div>
    </div>
  );
}

function BudgetInput({
  cents,
  onSave,
}: {
  cents: number;
  onSave: (val: string) => void;
}) {
  const [val, setVal] = useState((cents / 100).toString());
  useEffect(() => setVal((cents / 100).toString()), [cents]);
  return (
    <input
      className="budget-input"
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={() => onSave(val)}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}

function AccountForm({
  onDone,
  onCancel,
}: {
  onDone: () => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState("");
  const [institution, setInstitution] = useState("America First Credit Union");
  const [type, setType] = useState("checking");
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!name) return;
    setBusy(true);
    await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, institution, type }),
    });
    setBusy(false);
    onDone();
  }

  return (
    <div
      className="form-grid"
      style={{ flexDirection: "column", alignItems: "stretch" }}
    >
      <label className="field">
        Account name
        <input
          placeholder="e.g. Everyday Checking"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && create()}
        />
      </label>
      <label className="field">
        Institution
        <select
          value={institution}
          onChange={(e) => setInstitution(e.target.value)}
        >
          <option>America First Credit Union</option>
          <option>Mountain America Credit Union</option>
          <option>Other</option>
        </select>
      </label>
      <label className="field">
        Type
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="checking">Checking</option>
          <option value="savings">Savings</option>
          <option value="credit">Credit card</option>
        </select>
      </label>
      <div className="row-actions">
        <button onClick={create} disabled={busy || !name}>
          {busy ? "Saving…" : "Create account"}
        </button>
        {onCancel && (
          <button className="ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

function FirstRun({ onCreated }: { onCreated: () => void }) {
  return (
    <>
      <header className="topbar">
        <h1>💰 Budget</h1>
      </header>
      <div className="container" style={{ maxWidth: 520 }}>
        <div className="card">
          <h3>Welcome — add your first account</h3>
          <AccountForm onDone={onCreated} />
        </div>
      </div>
    </>
  );
}

function AccountsBar({
  accounts,
  onChange,
}: {
  accounts: Account[];
  onChange: () => void;
}) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <h3>Accounts</h3>
      <div style={{ padding: "12px 16px" }}>
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          {accounts.map((a) => (
            <span
              key={a.id}
              className="pill"
              title={a.institution}
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              {a.name}
              <button
                className="icon"
                title={`Delete "${a.name}" and all its transactions`}
                style={{ padding: 0, lineHeight: 1 }}
                onClick={async () => {
                  const n = a._count?.transactions ?? 0;
                  if (
                    !confirm(
                      `Delete "${a.name}"?\n\nThis permanently removes the account and its ${n} transaction${
                        n === 1 ? "" : "s"
                      }. This cannot be undone.`
                    )
                  )
                    return;
                  await fetch(`/api/accounts/${a.id}`, { method: "DELETE" });
                  onChange();
                }}
              >
                ✕
              </button>
            </span>
          ))}
          {!adding && (
            <button className="ghost" onClick={() => setAdding(true)}>
              + Add account
            </button>
          )}
          <span style={{ flex: 1 }} />
          <TellerControls onChange={onChange} />
          <PlaidControls onChange={onChange} />
        </div>
        {adding && (
          <div style={{ marginTop: 12, maxWidth: 360 }}>
            <AccountForm
              onDone={() => {
                setAdding(false);
                onChange();
              }}
              onCancel={() => setAdding(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Teller Connect ----
interface TellerEnrollmentResult {
  accessToken: string;
  enrollment: { id: string; institution?: { name?: string } };
}
interface TellerConnectInstance {
  open: () => void;
}
interface TellerConnectStatic {
  setup: (opts: {
    applicationId: string;
    environment: string;
    onSuccess: (e: TellerEnrollmentResult) => void;
    onExit?: () => void;
  }) => TellerConnectInstance;
}
declare global {
  interface Window {
    TellerConnect?: TellerConnectStatic;
  }
}

let tellerScriptPromise: Promise<void> | null = null;
function loadTellerConnect(): Promise<void> {
  if (typeof window !== "undefined" && window.TellerConnect) return Promise.resolve();
  if (tellerScriptPromise) return tellerScriptPromise;
  tellerScriptPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.teller.io/connect/connect.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Teller Connect"));
    document.head.appendChild(s);
  });
  return tellerScriptPromise;
}

// Connect a bank via Teller Connect (free tier, no business onboarding).
// Degrades gracefully when Teller isn't configured.
function TellerControls({ onChange }: { onChange: () => void }) {
  const [status, setStatus] = useState<{
    configured: boolean;
    applicationId: string | null;
    environment: string;
    enrollments: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/teller/sync")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  async function connect() {
    if (!status?.applicationId) {
      alert("Teller isn't configured yet. See TELLER.md.");
      return;
    }
    setBusy(true);
    try {
      await loadTellerConnect();
    } catch {
      setBusy(false);
      alert("Could not load Teller Connect (network?).");
      return;
    }
    setBusy(false);
    const teller = window.TellerConnect;
    if (!teller) return;
    const instance = teller.setup({
      applicationId: status.applicationId,
      environment: status.environment,
      onSuccess: async (enrollment) => {
        setBusy(true);
        const res = await fetch("/api/teller/enroll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accessToken: enrollment.accessToken,
            enrollmentId: enrollment.enrollment.id,
            institution: enrollment.enrollment.institution?.name,
          }),
        });
        const d = await res.json();
        setBusy(false);
        if (res.ok) {
          alert(
            `Connected ${d.institution ?? "bank"} (${d.accounts?.length ?? 0} account(s)). ` +
              `Imported ${d.sync?.added ?? 0} transactions.`
          );
          onChange();
        } else {
          alert(d.error ?? "Could not connect.");
        }
      },
    });
    instance.open();
  }

  async function syncNow() {
    setBusy(true);
    const res = await fetch("/api/teller/sync", { method: "POST" });
    const d = await res.json();
    setBusy(false);
    if (res.ok) {
      alert(`Synced ${d.enrollments} enrollment(s): +${d.added} added, ${d.updated} updated.`);
      onChange();
    } else {
      alert(d.error ?? "Sync failed.");
    }
  }

  if (!status?.configured) return null;

  return (
    <div className="row-actions">
      <button className="ghost" onClick={connect} disabled={busy}>
        🔗 Connect bank (Teller)
      </button>
      {status.enrollments > 0 && (
        <button className="ghost" onClick={syncNow} disabled={busy}>
          ↻ Sync Teller
        </button>
      )}
    </div>
  );
}

// Connect a bank via Plaid Link and pull data. Degrades gracefully when Plaid
// isn't configured (the link-token route returns 501 with a message).
function PlaidControls({ onChange }: { onChange: () => void }) {
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ items: number } | null>(null);

  useEffect(() => {
    fetch("/api/plaid/sync")
      .then((r) => r.json())
      .then((d) => setStatus({ items: d.items ?? 0 }))
      .catch(() => setStatus({ items: 0 }));
  }, []);

  const { open, ready } = usePlaidLink({
    token,
    onSuccess: async (public_token) => {
      setBusy(true);
      const res = await fetch("/api/plaid/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ public_token }),
      });
      const d = await res.json();
      setBusy(false);
      setToken(null);
      if (res.ok) {
        alert(
          `Connected ${d.institution ?? "bank"} (${d.accounts} account(s)). ` +
            `Imported ${d.sync?.added ?? 0} transactions.`
        );
        onChange();
      } else {
        alert(d.error ?? "Could not connect.");
      }
    },
  });

  useEffect(() => {
    if (token && ready) open();
  }, [token, ready, open]);

  async function connect() {
    setBusy(true);
    const res = await fetch("/api/plaid/link-token", { method: "POST" });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (d.link_token) {
      setToken(d.link_token);
    } else {
      alert(
        d.error
          ? `Plaid: ${d.error}${d.error_code ? ` (${d.error_code})` : ""}`
          : "Plaid request failed. See PLAID.md."
      );
    }
  }

  async function syncNow() {
    setBusy(true);
    const res = await fetch("/api/plaid/sync", { method: "POST" });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      let msg = `Synced ${d.items} item(s): +${d.added} added, ${d.modified} modified, ${d.removed} removed.`;
      if (d.errors && d.errors.length) {
        msg +=
          "\n\nSome banks reported an error:\n" +
          d.errors
            .map(
              (e: { institution: string; error: string; errorCode?: string }) =>
                `• ${e.institution}: ${e.error}${e.errorCode ? ` (${e.errorCode})` : ""}`
            )
            .join("\n");
      }
      alert(msg);
      onChange();
    } else {
      alert(d.error ?? "Sync failed.");
    }
  }

  return (
    <div className="row-actions">
      <button className="ghost" onClick={connect} disabled={busy}>
        🏦 Connect bank (Plaid)
      </button>
      {status && status.items > 0 && (
        <button className="ghost" onClick={syncNow} disabled={busy}>
          ↻ Sync now
        </button>
      )}
    </div>
  );
}
