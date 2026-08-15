import { NextRequest, NextResponse } from "next/server";
import { syncItem } from "@/lib/plaidSync";

// POST /api/plaid/webhook — Plaid calls this when something changes.
// For Transactions, the key event is SYNC_UPDATES_AVAILABLE: we respond by
// pulling incremental changes via transactions/sync.
//
// NOTE: In production you should verify the Plaid-Verification JWT header. For a
// local/sandbox setup behind a tunnel this is omitted; see PLAID.md.
export async function POST(req: NextRequest) {
  let body: {
    webhook_type?: string;
    webhook_code?: string;
    item_id?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const { webhook_type, webhook_code, item_id } = body;

  if (webhook_type === "TRANSACTIONS" && item_id) {
    const syncCodes = [
      "SYNC_UPDATES_AVAILABLE",
      "INITIAL_UPDATE",
      "HISTORICAL_UPDATE",
      "DEFAULT_UPDATE",
    ];
    if (webhook_code && syncCodes.includes(webhook_code)) {
      try {
        const result = await syncItem(item_id);
        return NextResponse.json({ ok: true, ...result });
      } catch (e) {
        console.error("webhook sync failed", e);
        return NextResponse.json({ ok: false }, { status: 500 });
      }
    }
  }

  // Acknowledge everything else so Plaid doesn't retry needlessly.
  return NextResponse.json({ ok: true, ignored: webhook_code ?? webhook_type });
}
