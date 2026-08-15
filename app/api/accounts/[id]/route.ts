import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// DELETE /api/accounts/:id
// Cascades to the account's transactions and import batches (see schema).
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const account = await prisma.account.findUnique({
    where: { id },
    include: { _count: { select: { transactions: true } } },
  });
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }
  await prisma.account.delete({ where: { id } });
  return NextResponse.json({
    ok: true,
    deletedTransactions: account._count.transactions,
  });
}
