import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { freelanceTaxSetAside } from "@/lib/taxes";

// GET /api/trends?months=6
// Monthly income vs. spending for the last N months (transfers excluded, and
// Freelance Taxes set-asides subtracted from income),
// plus a spending-by-category breakdown for `month` (YYYY-MM, default: current month).
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const months = Math.min(24, Math.max(1, Number(searchParams.get("months")) || 6));

  const now = new Date();
  const startYear = now.getUTCFullYear();
  const startMonth = now.getUTCMonth(); // 0-based
  const rangeStart = new Date(Date.UTC(startYear, startMonth - (months - 1), 1));
  const rangeEnd = new Date(Date.UTC(startYear, startMonth + 1, 1));

  // Month for the category breakdown (defaults to the current month). It may
  // fall outside the trend range, so widen the query window to include it.
  const currentKey = `${startYear}-${String(startMonth + 1).padStart(2, "0")}`;
  const monthParam = searchParams.get("month");
  const catKey =
    monthParam && /^\d{4}-\d{2}$/.test(monthParam) && monthParam <= currentKey
      ? monthParam
      : currentKey;
  const [catY, catM] = catKey.split("-").map(Number);
  const catStart = new Date(Date.UTC(catY, catM - 1, 1));
  const queryStart = catStart < rangeStart ? catStart : rangeStart;

  const [categories, accounts, txns] = await Promise.all([
    prisma.category.findMany(),
    prisma.account.findMany({ select: { id: true, name: true } }),
    prisma.transaction.findMany({
      where: { date: { gte: queryStart, lt: rangeEnd } },
      select: {
        date: true,
        amountCents: true,
        categoryId: true,
        accountId: true,
        description: true,
      },
    }),
  ]);
  const kindByCat = new Map(categories.map((c) => [c.id, c.kind]));
  const setAsideFor = freelanceTaxSetAside(accounts);

  // Prepare month buckets in chronological order.
  const buckets: { month: string; incomeCents: number; spendingCents: number }[] = [];
  const index = new Map<string, number>();
  for (let i = 0; i < months; i++) {
    const d = new Date(Date.UTC(startYear, startMonth - (months - 1) + i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    index.set(key, buckets.length);
    buckets.push({ month: key, incomeCents: 0, spendingCents: 0 });
  }

  const spendByCat = new Map<string, number>();

  for (const t of txns) {
    const kind = t.categoryId ? kindByCat.get(t.categoryId) : undefined;

    const key = `${t.date.getUTCFullYear()}-${String(
      t.date.getUTCMonth() + 1
    ).padStart(2, "0")}`;
    const bi = index.get(key);
    if (bi === undefined && key !== catKey) continue;

    const setAside = setAsideFor({ ...t, kind });
    if (setAside > 0) {
      if (bi !== undefined) buckets[bi].incomeCents -= setAside;
      continue;
    }
    if (kind === "transfer") continue;

    if (bi !== undefined) {
      if (t.amountCents >= 0) buckets[bi].incomeCents += t.amountCents;
      else buckets[bi].spendingCents += -t.amountCents;
    }

    if (key === catKey && t.amountCents < 0) {
      const catKey = t.categoryId ?? "__uncategorized__";
      spendByCat.set(catKey, (spendByCat.get(catKey) ?? 0) + -t.amountCents);
    }
  }

  const nameById = new Map(categories.map((c) => [c.id, c.name]));
  const colorById = new Map(categories.map((c) => [c.id, c.color]));
  const latestByCategory = [...spendByCat.entries()]
    .map(([catId, cents]) => ({
      categoryId: catId,
      name: catId === "__uncategorized__" ? "Uncategorized" : nameById.get(catId) ?? "?",
      color: catId === "__uncategorized__" ? "#adb5bd" : colorById.get(catId) ?? "#888",
      spentCents: cents,
    }))
    .sort((a, b) => b.spentCents - a.spentCents);

  return NextResponse.json({
    months: buckets,
    latestMonth: catKey,
    currentMonth: currentKey,
    latestByCategory,
  });
}
