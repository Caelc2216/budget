// Fills the local dev database with a few months of fake transactions so the
// UI has something to show. Run after `npm run db:seed`:
//   npx tsx prisma/sample-data.ts
// Re-running replaces the previous sample data (source = "sample").
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// [category, description, typical amount in dollars] — negative = spending.
const SPENDING: [string, string, number][] = [
  ["Groceries", "WALMART SUPERCENTER", -85],
  ["Groceries", "SMITHS FOOD", -42],
  ["Gas", "MAVERIK", -48],
  ["Gas", "CHEVRON", -36],
  ["Fast Food", "CHICK-FIL-A", -12],
  ["Fast Food", "TACO BELL", -9],
  ["Shopping", "AMAZON.COM", -34],
  ["Subscriptions", "SPOTIFY", -11.99],
  ["Subscriptions", "NETFLIX", -15.49],
  ["Bills", "ROCKY MOUNTAIN POWER", -64],
  ["Bills", "XFINITY INTERNET", -55],
  ["Entertainment", "CINEMARK", -24],
];

// Small deterministic RNG so every run produces the same data.
let seed = 42;
function rand() {
  seed = (seed * 1664525 + 1013904223) % 2 ** 32;
  return seed / 2 ** 32;
}

async function main() {
  const categories = await prisma.category.findMany();
  if (categories.length === 0) throw new Error("No categories — run `npm run db:seed` first.");
  const catId = new Map(categories.map((c) => [c.name, c.id]));

  let account = await prisma.account.findFirst({ where: { name: "Sample Checking" } });
  if (!account) {
    account = await prisma.account.create({
      data: { name: "Sample Checking", institution: "Sample Bank", type: "checking", mask: "0000" },
    });
  }
  await prisma.transaction.deleteMany({ where: { source: "sample" } });

  const now = new Date();
  const rows = [];
  for (let back = 0; back < 8; back++) {
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth() - back;
    // Don't put transactions in the future for the current month.
    const lastDay = back === 0 ? now.getUTCDate() : new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

    const add = (day: number, cat: string, desc: string, dollars: number) => {
      if (day > lastDay) return;
      const date = new Date(Date.UTC(y, m, day));
      const amountCents = Math.round(dollars * 100);
      rows.push({
        accountId: account!.id,
        date,
        description: desc,
        merchant: desc,
        amountCents,
        categoryId: cat ? catId.get(cat) ?? null : null,
        source: "sample",
        dedupeHash: `sample-${date.toISOString()}-${desc}-${amountCents}-${rows.length}`,
      });
    };

    add(1, "Paycheck", "ACME CORP PAYROLL", 1850);
    add(15, "Paycheck", "ACME CORP PAYROLL", 1850);
    for (const [cat, desc, base] of SPENDING) {
      // Each merchant shows up 0–3 times a month with a varied amount.
      const times = Math.floor(rand() * 4);
      for (let i = 0; i < times; i++) {
        add(1 + Math.floor(rand() * 28), cat, desc, +(base * (0.6 + rand() * 0.8)).toFixed(2));
      }
    }
    add(1 + Math.floor(rand() * 28), "", "VENMO PAYMENT", -(10 + Math.round(rand() * 30)));
  }

  await prisma.transaction.createMany({ data: rows });
  console.log(`Inserted ${rows.length} sample transactions into "Sample Checking".`);
}

main().finally(() => prisma.$disconnect());
