import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseAmountToCents } from "@/lib/money";

// POST /api/budgets  — set a category's budget for a month.
// Body: { month: "YYYY-MM", categoryId, limit }  (limit in dollars)
export async function POST(req: NextRequest) {
  const { month, categoryId, limit } = await req.json();
  if (!month || !/^\d{4}-\d{2}$/.test(month) || !categoryId) {
    return NextResponse.json(
      { error: "month (YYYY-MM) and categoryId required" },
      { status: 400 }
    );
  }
  const limitCents = parseAmountToCents(String(limit ?? 0)) ?? 0;

  const budget = await prisma.monthlyBudget.upsert({
    where: { month_categoryId: { month, categoryId } },
    update: { limitCents },
    create: { month, categoryId, limitCents },
  });
  return NextResponse.json(budget);
}
