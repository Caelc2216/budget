import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { categorize } from "@/lib/categorize";
import { parseAmountToCents } from "@/lib/money";

// GET /api/rules — list learned merchant rules (with category names).
export async function GET() {
  const rules = await prisma.merchantRule.findMany({
    orderBy: [{ pattern: "asc" }, { minAmountCents: "asc" }],
  });
  const cats = await prisma.category.findMany();
  const nameById = new Map(cats.map((c) => [c.id, c.name]));
  return NextResponse.json(
    rules.map((r) => ({ ...r, categoryName: nameById.get(r.categoryId) ?? "?" }))
  );
}

// POST /api/rules — remember a merchant → category mapping, optionally bounded
// by amount. Body: { pattern, categoryId, minAmount?, maxAmount?, applyToExisting? }
// minAmount/maxAmount are dollars; bounds test the ABSOLUTE transaction amount
// (min inclusive, max exclusive), enabling rules like "Maverik under $10 → Fast Food".
export async function POST(req: NextRequest) {
  const { pattern, categoryId, minAmount, maxAmount, applyToExisting } =
    await req.json();
  const clean = String(pattern ?? "").trim().toLowerCase();
  if (!clean || !categoryId) {
    return NextResponse.json(
      { error: "pattern and categoryId are required" },
      { status: 400 }
    );
  }

  const minAmountCents =
    minAmount === "" || minAmount == null ? null : parseAmountToCents(String(minAmount));
  const maxAmountCents =
    maxAmount === "" || maxAmount == null ? null : parseAmountToCents(String(maxAmount));

  // Upsert on (pattern, min, max): update the category if this exact rule
  // already exists, otherwise create it. (Nulls make compound-unique upsert
  // finicky, so match-then-write explicitly.)
  const existing = await prisma.merchantRule.findFirst({
    where: { pattern: clean, minAmountCents, maxAmountCents },
  });
  if (existing) {
    await prisma.merchantRule.update({
      where: { id: existing.id },
      data: { categoryId },
    });
  } else {
    await prisma.merchantRule.create({
      data: { pattern: clean, categoryId, minAmountCents, maxAmountCents },
    });
  }

  let updated = 0;
  if (applyToExisting) {
    // Re-run categorization on matching rows so the rule takes effect on data
    // already imported. categorize() honors amount bounds + specificity.
    const matches = await prisma.transaction.findMany({
      where: { description: { contains: clean } },
      select: { id: true, description: true, amountCents: true, categoryId: true },
    });
    for (const t of matches) {
      const newCat = await categorize(t.description, t.amountCents);
      if (newCat && newCat !== t.categoryId) {
        await prisma.transaction.update({
          where: { id: t.id },
          data: { categoryId: newCat },
        });
        updated++;
      }
    }
  }

  return NextResponse.json({ ok: true, pattern: clean, updated });
}

// DELETE /api/rules?id=...  (preferred) or ?pattern=... (deletes all for that pattern)
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const pattern = searchParams.get("pattern");
  if (id) {
    await prisma.merchantRule.delete({ where: { id } }).catch(() => null);
    return NextResponse.json({ ok: true });
  }
  if (pattern) {
    await prisma.merchantRule.deleteMany({ where: { pattern: pattern.toLowerCase() } });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "id or pattern required" }, { status: 400 });
}
