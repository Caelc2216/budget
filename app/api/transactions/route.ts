import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseDate, dedupeHash } from "@/lib/csv";
import { parseAmountToCents } from "@/lib/money";
import { categorize } from "@/lib/categorize";

// GET /api/transactions?month=YYYY-MM[&accountId=...]
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month");
  const accountId = searchParams.get("accountId");

  const where: Record<string, unknown> = {};
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split("-").map(Number);
    where.date = {
      gte: new Date(Date.UTC(y, m - 1, 1)),
      lt: new Date(Date.UTC(y, m, 1)),
    };
  }
  if (accountId) where.accountId = accountId;

  const transactions = await prisma.transaction.findMany({
    where,
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    include: { category: true, account: true },
  });
  return NextResponse.json(transactions);
}

// POST /api/transactions  — manual entry
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { accountId, date, description, cost, categoryId, kind } = body;

  if (!accountId || !date || !description || cost == null) {
    return NextResponse.json(
      { error: "accountId, date, description, and cost are required" },
      { status: 400 }
    );
  }

  const parsedDate = parseDate(String(date));
  if (!parsedDate) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  const magnitude = parseAmountToCents(String(cost));
  if (magnitude === null) {
    return NextResponse.json({ error: "Invalid cost" }, { status: 400 });
  }
  // Expenses are stored negative, income positive.
  const amountCents = kind === "income" ? Math.abs(magnitude) : -Math.abs(magnitude);

  const resolvedCategoryId =
    categoryId || (await categorize(description, amountCents));

  const hash = dedupeHash(parsedDate, amountCents, description);

  try {
    const tx = await prisma.transaction.create({
      data: {
        accountId,
        date: parsedDate,
        description,
        merchant: description,
        amountCents,
        categoryId: resolvedCategoryId,
        source: "manual",
        dedupeHash: hash,
      },
      include: { category: true },
    });
    return NextResponse.json(tx, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "That transaction already exists (same date, amount, description)." },
      { status: 409 }
    );
  }
}
