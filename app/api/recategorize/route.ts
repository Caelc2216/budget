import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { categorize } from "@/lib/categorize";

// POST /api/recategorize
// Re-applies merchant rules to transactions. By default only fills in
// transactions that are still uncategorized, so manual choices are preserved.
// Body: { month?: "YYYY-MM", all?: boolean }
//   month  — limit to that month (default: all months)
//   all    — if true, also re-evaluate already-categorized transactions
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { month, all } = body as { month?: string; all?: boolean };

  const where: Record<string, unknown> = {};
  if (!all) where.categoryId = null;
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split("-").map(Number);
    where.date = {
      gte: new Date(Date.UTC(y, m - 1, 1)),
      lt: new Date(Date.UTC(y, m, 1)),
    };
  }

  const txns = await prisma.transaction.findMany({
    where,
    select: { id: true, description: true, amountCents: true, categoryId: true },
  });

  let updated = 0;
  for (const t of txns) {
    const categoryId = await categorize(t.description, t.amountCents);
    if (categoryId && categoryId !== t.categoryId) {
      await prisma.transaction.update({
        where: { id: t.id },
        data: { categoryId },
      });
      updated++;
    }
  }

  return NextResponse.json({ scanned: txns.length, updated });
}
