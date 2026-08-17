"use client";

import { useEffect, useState, useCallback } from "react";
import AppNav from "@/app/components/AppNav";
import ThemeToggle from "@/app/components/ThemeToggle";
import { formatCents } from "@/lib/money";

interface MonthPoint {
  month: string;
  incomeCents: number;
  spendingCents: number;
}
interface CatSlice {
  categoryId: string;
  name: string;
  color: string;
  spentCents: number;
}
interface Trends {
  months: MonthPoint[];
  latestMonth: string;
  latestByCategory: CatSlice[];
}

function monthShort(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
}
function monthLong(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function ReportsPage() {
  const [range, setRange] = useState(6);
  const [data, setData] = useState<Trends | null>(null);

  const load = useCallback(async () => {
    const d = await fetch(`/api/trends?months=${range}`).then((r) => r.json());
    setData(d);
  }, [range]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <header className="topbar">
        <h1>💰 Budget</h1>
        <div className="header-actions">
          <ThemeToggle />
          <AppNav />
        </div>
      </header>

      <div className="container" style={{ maxWidth: 980 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h2 style={{ marginRight: "auto" }}>Reports</h2>
          <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            Range
            <select value={range} onChange={(e) => setRange(Number(e.target.value))}>
              <option value={3}>3 months</option>
              <option value={6}>6 months</option>
              <option value={12}>12 months</option>
            </select>
          </label>
        </div>

        {!data ? (
          <p className="muted">Loading…</p>
        ) : (
          <div className="layout">
            <div className="card">
              <h3>Income vs. Spending</h3>
              <div style={{ padding: 16 }}>
                <TrendChart points={data.months} />
              </div>
            </div>
            <div className="card">
              <h3>Spending by category — {monthLong(data.latestMonth)}</h3>
              <div style={{ padding: 16 }}>
                <CategoryDonut slices={data.latestByCategory} />
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function TrendChart({ points }: { points: MonthPoint[] }) {
  const W = 560;
  const H = 260;
  const padL = 48;
  const padB = 28;
  const padT = 10;
  const max = Math.max(
    1,
    ...points.map((p) => Math.max(p.incomeCents, p.spendingCents))
  );
  const plotW = W - padL - 10;
  const plotH = H - padB - padT;
  const groupW = plotW / points.length;
  const barW = Math.min(26, groupW / 2 - 4);

  // Y gridlines at 0, 50%, 100% of max.
  const ticks = [0, 0.5, 1].map((f) => ({
    y: padT + plotH - f * plotH,
    label: formatCents(Math.round(max * f)),
  }));

  return (
    <div style={{ overflowX: "auto" }}>
      <svg width={W} height={H} role="img" aria-label="Income versus spending by month">
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} y1={t.y} x2={W - 10} y2={t.y} stroke="var(--border)" />
            <text x={padL - 6} y={t.y + 4} textAnchor="end" fontSize="10" fill="var(--muted)">
              {t.label}
            </text>
          </g>
        ))}
        {points.map((p, i) => {
          const gx = padL + i * groupW + groupW / 2;
          const incH = (p.incomeCents / max) * plotH;
          const spH = (p.spendingCents / max) * plotH;
          return (
            <g key={p.month}>
              <rect
                x={gx - barW - 2}
                y={padT + plotH - incH}
                width={barW}
                height={incH}
                fill="#2f9e44"
                rx={2}
              >
                <title>{`Income ${formatCents(p.incomeCents)}`}</title>
              </rect>
              <rect
                x={gx + 2}
                y={padT + plotH - spH}
                width={barW}
                height={spH}
                fill="#e03131"
                rx={2}
              >
                <title>{`Spending ${formatCents(p.spendingCents)}`}</title>
              </rect>
              <text
                x={gx}
                y={H - 10}
                textAnchor="middle"
                fontSize="11"
                fill="var(--muted)"
              >
                {monthShort(p.month)}
              </text>
            </g>
          );
        })}
      </svg>
      <div style={{ display: "flex", gap: 16, fontSize: 12, marginTop: 4 }}>
        <Legend color="#2f9e44" label="Income" />
        <Legend color="#e03131" label="Spending" />
      </div>
    </div>
  );
}

function CategoryDonut({ slices }: { slices: CatSlice[] }) {
  const total = slices.reduce((s, c) => s + c.spentCents, 0);
  if (total === 0) {
    return <p className="muted">No spending recorded for this month yet.</p>;
  }
  const size = 200;
  const r = 80;
  const cx = size / 2;
  const cy = size / 2;
  const stroke = 30;
  const circ = 2 * Math.PI * r;

  let offset = 0;
  const arcs = slices.map((c) => {
    const frac = c.spentCents / total;
    const seg = {
      color: c.color,
      dash: frac * circ,
      gap: circ - frac * circ,
      offset: -offset * circ,
      name: c.name,
    };
    offset += frac;
    return seg;
  });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <svg width={size} height={size} role="img" aria-label="Spending by category">
          <g transform={`rotate(-90 ${cx} ${cy})`}>
            {arcs.map((a, i) => (
              <circle
                key={i}
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={a.color}
                strokeWidth={stroke}
                strokeDasharray={`${a.dash} ${a.gap}`}
                strokeDashoffset={a.offset}
              >
                <title>{a.name}</title>
              </circle>
            ))}
          </g>
          <text x={cx} y={cy - 2} textAnchor="middle" fontSize="12" fill="var(--muted)">
            Total
          </text>
          <text x={cx} y={cy + 16} textAnchor="middle" fontSize="15" fontWeight={700} fill="var(--text)">
            {formatCents(total)}
          </text>
        </svg>
      </div>
      <div style={{ marginTop: 12 }}>
        {slices.map((c) => (
          <div
            key={c.categoryId}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "3px 0",
              fontSize: 13,
            }}
          >
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: 3,
                background: c.color,
                flexShrink: 0,
              }}
            />
            <span style={{ flex: 1 }}>{c.name}</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>
              {formatCents(c.spentCents)}
            </span>
            <span className="muted" style={{ width: 42, textAlign: "right" }}>
              {Math.round((c.spentCents / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 12, height: 12, borderRadius: 3, background: color }} />
      {label}
    </span>
  );
}
