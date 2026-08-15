import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const categories = await prisma.category.findMany({
    orderBy: { sortOrder: "asc" },
  });
  return NextResponse.json(categories);
}

export async function POST(req: NextRequest) {
  const { name, kind, color } = await req.json();
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const validKind =
    kind === "income" || kind === "transfer" ? kind : "expense";
  const max = await prisma.category.aggregate({ _max: { sortOrder: true } });
  try {
    const category = await prisma.category.create({
      data: {
        name,
        kind: validKind,
        color: color || "#868e96",
        sortOrder: (max._max.sortOrder ?? 0) + 1,
      },
    });
    return NextResponse.json(category, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "A category with that name already exists." },
      { status: 409 }
    );
  }
}
