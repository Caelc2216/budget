import { prisma } from "./db";
import { tellerGet, type TellerTransaction } from "./teller";
import { categorize } from "./categorize";

// Teller's `amount` is already in our convention: negative = money out
// (spending), positive = money in. So we just scale to cents.
function toAmountCents(t: TellerTransaction): number {
  return Math.round(parseFloat(t.amount) * 100);
}

function describe(t: TellerTransaction): string {
  return t.details?.counterparty?.name || t.description || "(unknown)";
}

export interface TellerSyncResult {
  enrollmentId: string;
  added: number;
  updated: number;
}

// How many recent transactions to fetch per account each sync. Dedupe by
// tellerTransactionId makes overlapping pulls safe.
const PER_ACCOUNT_COUNT = 500;

/** Pull recent transactions for every account under one enrollment. */
export async function syncEnrollment(enrollmentId: string): Promise<TellerSyncResult> {
  const enrollment = await prisma.tellerEnrollment.findUnique({
    where: { enrollmentId },
    include: { accounts: true },
  });
  if (!enrollment) throw new Error(`Unknown Teller enrollment ${enrollmentId}`);

  let added = 0;
  let updated = 0;

  for (const account of enrollment.accounts) {
    if (!account.tellerAccountId) continue;
    const txns = await tellerGet<TellerTransaction[]>(
      `/accounts/${account.tellerAccountId}/transactions?count=${PER_ACCOUNT_COUNT}`,
      enrollment.accessToken
    );

    for (const t of txns) {
      const amountCents = toAmountCents(t);
      const description = describe(t);
      const categoryId = await categorize(description, amountCents);
      const date = new Date(`${t.date}T00:00:00Z`);
      const pending = t.status === "pending";

      const existing = await prisma.transaction.findUnique({
        where: { tellerTransactionId: t.id },
      });
      if (existing) {
        await prisma.transaction.update({
          where: { tellerTransactionId: t.id },
          data: {
            date,
            description,
            merchant: description,
            amountCents,
            pending,
            categoryId: existing.categoryId ?? categoryId,
          },
        });
        updated++;
      } else {
        await prisma.transaction.create({
          data: {
            accountId: account.id,
            date,
            description,
            merchant: description,
            amountCents,
            categoryId,
            source: "teller",
            pending,
            tellerTransactionId: t.id,
            // Teller's unique id as the dedupe key (avoids content false-collisions).
            dedupeHash: `teller:${t.id}`,
          },
        });
        added++;
      }
    }
  }

  return { enrollmentId, added, updated };
}

/** Sync every connected Teller enrollment. */
export async function syncAllTeller(): Promise<TellerSyncResult[]> {
  const enrollments = await prisma.tellerEnrollment.findMany({
    select: { enrollmentId: true },
  });
  const results: TellerSyncResult[] = [];
  for (const e of enrollments) {
    results.push(await syncEnrollment(e.enrollmentId));
  }
  return results;
}
