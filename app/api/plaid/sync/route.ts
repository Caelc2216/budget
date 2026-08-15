import { NextResponse } from "next/server";
import { plaidConfigured } from "@/lib/plaid";
import { syncAllItems } from "@/lib/plaidSync";
import { prisma } from "@/lib/db";

// GET /api/plaid/sync — status: how many items are connected.
export async function GET() {
  const count = await prisma.plaidItem.count();
  return NextResponse.json({ configured: plaidConfigured(), items: count });
}

// POST /api/plaid/sync — manually pull the latest from all connected items.
export async function POST() {
  if (!plaidConfigured()) {
    return NextResponse.json({ error: "Plaid not configured." }, { status: 501 });
  }
  try {
    const results = await syncAllItems();
    const totals = results.reduce(
      (acc, r) => ({
        added: acc.added + r.added,
        modified: acc.modified + r.modified,
        removed: acc.removed + r.removed,
      }),
      { added: 0, modified: 0, removed: 0 }
    );
    const errors = results
      .filter((r) => r.error)
      .map((r) => ({
        institution: r.institutionName ?? r.itemId,
        error: r.error,
        errorCode: r.errorCode,
      }));
    return NextResponse.json({ items: results.length, ...totals, errors, results });
  } catch (e) {
    const message = e instanceof Error ? e.message : "sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
