"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

interface Category {
  id: string;
  name: string;
  color: string;
  kind: string;
  sortOrder: number;
}
interface Rule {
  id: string;
  pattern: string;
  categoryId: string;
  categoryName: string;
  minAmountCents: number | null;
  maxAmountCents: number | null;
}

const KIND_LABEL: Record<string, string> = {
  expense: "Expense",
  income: "Income",
  transfer: "Transfer",
};

export default function ManagePage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);

  const load = useCallback(async () => {
    const [c, r] = await Promise.all([
      fetch("/api/categories").then((x) => x.json()),
      fetch("/api/rules").then((x) => x.json()),
    ]);
    setCategories(c);
    setRules(r);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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

      <div className="container" style={{ maxWidth: 860 }}>
        <h2>Manage</h2>
        <div className="layout" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <CategoriesCard categories={categories} onChange={load} />
          <RulesCard rules={rules} categories={categories} onChange={load} />
        </div>
      </div>
    </>
  );
}

function CategoriesCard({
  categories,
  onChange,
}: {
  categories: Category[];
  onChange: () => void;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState("expense");
  const [color, setColor] = useState("#4c6ef5");

  async function add() {
    if (!name.trim()) return;
    const res = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, kind, color }),
    });
    if (!res.ok) {
      const d = await res.json();
      alert(d.error ?? "Could not add category");
      return;
    }
    setName("");
    onChange();
  }

  async function patch(id: string, data: Record<string, unknown>) {
    await fetch(`/api/categories/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    onChange();
  }

  async function remove(c: Category) {
    if (
      !confirm(
        `Delete category "${c.name}"?\n\nTransactions in it become uncategorized and its saved rules are removed. This cannot be undone.`
      )
    )
      return;
    await fetch(`/api/categories/${c.id}`, { method: "DELETE" });
    onChange();
  }

  return (
    <div className="card">
      <h3>Categories</h3>
      <div style={{ padding: 12 }}>
        {categories.map((c) => (
          <div
            key={c.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "5px 0",
            }}
          >
            <input
              type="color"
              value={c.color}
              onChange={(e) => patch(c.id, { color: e.target.value })}
              style={{ width: 28, height: 24, padding: 0, border: "none", background: "none" }}
              title="Color"
            />
            <input
              defaultValue={c.name}
              onBlur={(e) =>
                e.target.value.trim() &&
                e.target.value !== c.name &&
                patch(c.id, { name: e.target.value })
              }
              style={{ flex: 1 }}
            />
            <select value={c.kind} onChange={(e) => patch(c.id, { kind: e.target.value })}>
              <option value="expense">Expense</option>
              <option value="income">Income</option>
              <option value="transfer">Transfer</option>
            </select>
            <button className="icon" title="Delete" onClick={() => remove(c)}>
              ✕
            </button>
          </div>
        ))}
      </div>
      <div
        className="form-grid"
        style={{ borderTop: "1px solid var(--border)", alignItems: "center" }}
      >
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
          style={{ width: 32, height: 30, padding: 0, border: "none", background: "none" }} />
        <input
          placeholder="New category name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          style={{ flex: 1, minWidth: 120 }}
        />
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="expense">Expense</option>
          <option value="income">Income</option>
          <option value="transfer">Transfer</option>
        </select>
        <button onClick={add}>Add</button>
      </div>
    </div>
  );
}

function RulesCard({
  rules,
  categories,
  onChange,
}: {
  rules: Rule[];
  categories: Category[];
  onChange: () => void;
}) {
  const [pattern, setPattern] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [applyToExisting, setApplyToExisting] = useState(true);

  useEffect(() => {
    if (!categoryId && categories[0]) setCategoryId(categories[0].id);
  }, [categories, categoryId]);

  async function add() {
    if (!pattern.trim() || !categoryId) return;
    const res = await fetch("/api/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pattern, categoryId, minAmount, maxAmount, applyToExisting }),
    });
    const d = await res.json();
    if (d.updated > 0) alert(`Applied to ${d.updated} existing transaction(s).`);
    setPattern("");
    setMinAmount("");
    setMaxAmount("");
    onChange();
  }

  async function remove(id: string) {
    await fetch(`/api/rules?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    onChange();
  }

  function bounds(r: Rule): string {
    const min = r.minAmountCents != null ? `$${(r.minAmountCents / 100).toFixed(2)}` : null;
    const max = r.maxAmountCents != null ? `$${(r.maxAmountCents / 100).toFixed(2)}` : null;
    if (min && max) return `${min}–<${max}`;
    if (max) return `<${max}`;
    if (min) return `≥${min}`;
    return "";
  }

  return (
    <div className="card">
      <h3>Auto-categorization rules ({rules.length})</h3>
      <div style={{ padding: 12, maxHeight: 360, overflowY: "auto" }}>
        {rules.map((r) => (
          <div
            key={r.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "4px 0",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            <code style={{ fontSize: 13 }}>{r.pattern}</code>
            {bounds(r) && (
              <span className="pill" style={{ fontSize: 11 }}>
                {bounds(r)}
              </span>
            )}
            <span className="muted" style={{ fontSize: 12, marginLeft: "auto" }}>
              → {r.categoryName}
            </span>
            <button className="icon" title="Forget rule" onClick={() => remove(r.id)}>
              ✕
            </button>
          </div>
        ))}
        {rules.length === 0 && <div className="muted">No rules yet.</div>}
      </div>
      <div
        className="form-grid"
        style={{ borderTop: "1px solid var(--border)", alignItems: "center", gap: 6 }}
      >
        <input
          placeholder="keyword (e.g. maverik)"
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          style={{ flex: 1, minWidth: 110 }}
        />
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          placeholder="min $"
          value={minAmount}
          onChange={(e) => setMinAmount(e.target.value)}
          style={{ width: 60 }}
          title="Only apply at or above this amount (optional)"
        />
        <input
          placeholder="max $"
          value={maxAmount}
          onChange={(e) => setMaxAmount(e.target.value)}
          style={{ width: 60 }}
          title="Only apply below this amount (optional)"
        />
        <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <input
            type="checkbox"
            checked={applyToExisting}
            onChange={(e) => setApplyToExisting(e.target.checked)}
          />
          apply now
        </label>
        <button onClick={add}>Add</button>
      </div>
    </div>
  );
}
