import type { Transaction as PlaidTransaction } from "plaid";
import { prisma } from "./db";
import { getPlaidClient } from "./plaid";
import { categorize } from "./categorize";

// Convert a Plaid transaction to our money convention.
// Plaid `amount` is POSITIVE when money leaves the account (spending) and
// negative when money enters it. We store the opposite (negative = spending).
function toAmountCents(t: PlaidTransaction): number {
  return -Math.round(t.amount * 100);
}

function describe(t: PlaidTransaction): string {
  return t.merchant_name || t.name || "(unknown)";
}

export interface SyncResult {
  itemId: string;
  institutionName?: string | null;
  added: number;
  modified: number;
  removed: number;
  error?: string;
  errorCode?: string;
}

// Extract Plaid's structured error (error_code / error_message) from a failure.
function plaidError(e: unknown): { code?: string; message: string } {
  const err = e as {
    response?: { data?: { error_code?: string; error_message?: string } };
    message?: string;
  };
  const data = err.response?.data;
  return {
    code: data?.error_code,
    message: data?.error_message || err.message || "sync failed",
  };
}

/**
 * Pull incremental changes for one Plaid item via /transactions/sync and apply
 * them to our tables. Uses the stored cursor so each call only fetches what's
 * new since last time. Idempotent: added/modified upsert by plaidTransactionId.
 */
export async function syncItem(itemId: string): Promise<SyncResult> {
  const item = await prisma.plaidItem.findUnique({
    where: { itemId },
    include: { accounts: true },
  });
  if (!item) throw new Error(`Unknown Plaid item ${itemId}`);

  const client = getPlaidClient();
  // Map Plaid account_id -> our Account.id for this item.
  const accountByPlaidId = new Map(
    item.accounts
      .filter((a) => a.plaidAccountId)
      .map((a) => [a.plaidAccountId as string, a.id])
  );

  let cursor = item.cursor ?? undefined;
  let added = 0;
  let modified = 0;
  let removed = 0;
  let hasMore = true;

  while (hasMore) {
    const res = await client.transactionsSync({
      access_token: item.accessToken,
      cursor,
      count: 500,
    });
    const data = res.data;

    for (const t of [...data.added, ...data.modified]) {
      const accountId = accountByPlaidId.get(t.account_id);
      if (!accountId) continue; // account we didn't import; skip
      const amountCents = toAmountCents(t);
      const description = describe(t);
      const categoryId = await categorize(description, amountCents);

      const existing = await prisma.transaction.findUnique({
        where: { plaidTransactionId: t.transaction_id },
      });
      if (existing) {
        await prisma.transaction.update({
          where: { plaidTransactionId: t.transaction_id },
          data: {
            date: new Date(t.date),
            description,
            merchant: t.merchant_name ?? description,
            amountCents,
            pending: t.pending ?? false,
            // keep an existing manual category if the user set one
            categoryId: existing.categoryId ?? categoryId,
          },
        });
        modified++;
      } else {
        await prisma.transaction.create({
          data: {
            accountId,
            date: new Date(t.date),
            description,
            merchant: t.merchant_name ?? description,
            amountCents,
            categoryId,
            source: "plaid",
            pending: t.pending ?? false,
            plaidTransactionId: t.transaction_id,
            // Use Plaid's globally-unique id as the dedupe key — a content hash
            // would false-collide on legitimately identical transactions.
            dedupeHash: `plaid:${t.transaction_id}`,
          },
        });
        added++;
      }
    }

    for (const r of data.removed) {
      if (!r.transaction_id) continue;
      await prisma.transaction
        .delete({ where: { plaidTransactionId: r.transaction_id } })
        .catch(() => null); // already gone
      removed++;
    }

    cursor = data.next_cursor;
    hasMore = data.has_more;
  }

  await prisma.plaidItem.update({
    where: { itemId },
    data: { cursor },
  });

  return { itemId, added, modified, removed };
}

/**
 * Sync every connected Plaid item. Each item is isolated: if one bank errors
 * (e.g. its transactions aren't ready yet), the others still sync, and the
 * failing item's Plaid error is reported instead of aborting everything.
 */
export async function syncAllItems(): Promise<SyncResult[]> {
  const items = await prisma.plaidItem.findMany({
    select: { itemId: true, institutionName: true },
  });
  const results: SyncResult[] = [];
  for (const it of items) {
    try {
      const r = await syncItem(it.itemId);
      results.push({ ...r, institutionName: it.institutionName });
    } catch (e) {
      const { code, message } = plaidError(e);
      results.push({
        itemId: it.itemId,
        institutionName: it.institutionName,
        added: 0,
        modified: 0,
        removed: 0,
        error: message,
        errorCode: code,
      });
    }
  }
  return results;
}
