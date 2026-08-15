import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET /api/summary?month=YYYY-MM
// Returns per-category budget vs. actual spend, plus income/spending/net totals.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month");
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "month=YYYY-MM required" }, { status: 400 });
  }

  const [y, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));

  const [categories, budgets, txns] = await Promise.all([
    prisma.category.findMany({ orderBy: { sortOrder: "asc" } }),
    // All budgets up to and including this month, so a month with no explicit
    // targets inherits the most recent prior month's values (carry-forward).
    prisma.monthlyBudget.findMany({
      where: { month: { lte: month } },
      orderBy: { month: "asc" },
    }),
    prisma.transaction.findMany({
      where: { date: { gte: start, lt: end } },
      select: { categoryId: true, amountCents: true },
    }),
  ]);

  // Categories flagged as transfers are excluded from every total: moving money
  // between your own accounts (e.g. paying off a credit card from savings) is
  // neither income nor spending — the underlying purchases were already counted.
  const kindByCat = new Map(categories.map((c) => [c.id, c.kind]));

  // Later months overwrite earlier ones, leaving the latest effective budget.
  const budgetByCat = new Map<string, number>();
  for (const b of budgets) budgetByCat.set(b.categoryId, b.limitCents);
  const spentByCat = new Map<string, number>();
  let incomeCents = 0;
  let spendingCents = 0;
  let transfersCents = 0;
  let uncategorizedCents = 0;

  for (const t of txns) {
    const kind = t.categoryId ? kindByCat.get(t.categoryId) : undefined;

    if (kind === "transfer") {
      transfersCents += Math.abs(t.amountCents);
      continue; // never counts toward income, spending, or budgets
    }

    if (t.amountCents >= 0) incomeCents += t.amountCents;
    else spendingCents += -t.amountCents;

    if (t.categoryId) {
      spentByCat.set(
        t.categoryId,
        (spentByCat.get(t.categoryId) ?? 0) + Math.abs(t.amountCents)
      );
    } else if (t.amountCents < 0) {
      uncategorizedCents += -t.amountCents;
    }
  }

  const expenseRows = categories
    .filter((c) => c.kind === "expense")
    .map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      budgetCents: budgetByCat.get(c.id) ?? 0,
      spentCents: spentByCat.get(c.id) ?? 0,
    }));

  const totalBudgetCents = expenseRows.reduce((s, r) => s + r.budgetCents, 0);

  return NextResponse.json({
    month,
    expenseRows,
    uncategorizedCents,
    totals: {
      incomeCents,
      spendingCents,
      netCents: incomeCents - spendingCents,
      totalBudgetCents,
      transfersCents,
    },
  });
}
