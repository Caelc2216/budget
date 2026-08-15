import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// PATCH /api/transactions/:id — update a transaction's category.
// (Remembering a merchant→category rule is done via POST /api/rules, which
// also supports amount bounds and applying to existing transactions.)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { categoryId } = await req.json();

  const tx = await prisma.transaction.update({
    where: { id },
    data: { categoryId: categoryId || null },
    include: { category: true },
  });

  return NextResponse.json(tx);
}

// DELETE /api/transactions/:id
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.transaction.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
