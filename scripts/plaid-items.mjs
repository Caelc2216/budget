import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const items = await p.plaidItem.findMany();
for (const it of items) {
  const accts = await p.account.findMany({ where: { plaidItemId: it.itemId }, include: { _count: { select: { transactions: true } } } });
  const env = it.accessToken.startsWith("access-sandbox") ? "SANDBOX" : it.accessToken.startsWith("access-production") ? "production" : "?";
  console.log(`ITEM ${it.itemId}  "${it.institutionName}"  [${env}]  accounts=${accts.length}`);
  for (const a of accts) console.log(`    - ${a.name} txns=${a._count.transactions}`);
}
console.log("total accounts:", await p.account.count(), "total txns:", await p.transaction.count());
await p.$disconnect();
