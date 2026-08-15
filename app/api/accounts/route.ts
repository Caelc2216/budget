import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const accounts = await prisma.account.findMany({
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { transactions: true } } },
  });
  return NextResponse.json(accounts);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, institution, type, mask } = body;
  if (!name || !institution) {
    return NextResponse.json(
      { error: "name and institution are required" },
      { status: 400 }
    );
  }
  const account = await prisma.account.create({
    data: { name, institution, type: type || "checking", mask: mask || null },
  });
  return NextResponse.json(account, { status: 201 });
}
