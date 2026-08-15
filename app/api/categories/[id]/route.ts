import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// PATCH /api/categories/:id — rename, recolor, change kind, or reorder.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (typeof body.color === "string") data.color = body.color;
  if (body.kind === "expense" || body.kind === "income" || body.kind === "transfer")
    data.kind = body.kind;
  if (typeof body.sortOrder === "number") data.sortOrder = body.sortOrder;

  try {
    const category = await prisma.category.update({ where: { id }, data });
    return NextResponse.json(category);
  } catch {
    return NextResponse.json(
      { error: "Could not update (name may already exist)." },
      { status: 409 }
    );
  }
}

// DELETE /api/categories/:id
// Transactions in this category become uncategorized (FK set null); monthly
// budgets cascade; merchant rules pointing here are removed so nothing dangles.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.merchantRule.deleteMany({ where: { categoryId: id } });
  await prisma.transaction.updateMany({
    where: { categoryId: id },
    data: { categoryId: null },
  });
  await prisma.category.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
