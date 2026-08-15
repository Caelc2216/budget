import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

const accts = await p.account.findMany({
  orderBy: { createdAt: "asc" },
  include: { _count: { select: { transactions: true } } },
});
for (const a of accts) {
  console.log(
    `ACCT ${a.id}  "${a.name}" (${a.institution}) [${a.type}]  txns=${a._count.transactions}  created=${a.createdAt.toISOString()}`
  );
  const txns = await p.transaction.findMany({
    where: { accountId: a.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, date: true, description: true, amountCents: true, source: true, createdAt: true },
  });
  for (const t of txns) {
    console.log(
      `    ${t.date.toISOString().slice(0, 10)}  ${(t.amountCents / 100).toFixed(2).padStart(10)}  ${t.source.padEnd(6)}  ${t.description}`
    );
  }
}
await p.$disconnect();
