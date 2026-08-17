import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Canonical categories, in the order they appear in the budget panel.
// `budget` is the latest monthly target (dollars) from the user's spreadsheet.
const EXPENSE_CATEGORIES: { name: string; color: string; budget: number }[] = [
  { name: "Groceries", color: "#2f9e44", budget: 320 },
  { name: "Gas", color: "#e8590c", budget: 200 },
  { name: "Fast Food", color: "#f08c00", budget: 50 },
  { name: "Shopping", color: "#ae3ec9", budget: 100 },
  { name: "Subscriptions", color: "#1971c2", budget: 39 },
  { name: "Bills", color: "#e03131", budget: 200 },
  { name: "Entertainment", color: "#0c8599", budget: 50 },
  { name: "School", color: "#5f3dc4", budget: 0 },
  { name: "Car", color: "#495057", budget: 0 },
  { name: "Home", color: "#a9611f", budget: 0 },
  { name: "Health", color: "#c2255c", budget: 0 },
  { name: "Travel", color: "#3b5bdb", budget: 0 },
  { name: "Gift", color: "#d6336c", budget: 0 },
];

const INCOME_CATEGORIES: { name: string; color: string }[] = [
  { name: "Paycheck", color: "#2b8a3e" },
  { name: "Other Income", color: "#37b24d" },
];

// Transfers move money between your own accounts (e.g. paying off a credit card
// from savings). They are excluded from income, spending, net, and budgets.
const TRANSFER_CATEGORIES: { name: string; color: string }[] = [
  { name: "Credit Card Payment", color: "#868e96" },
  { name: "Transfer", color: "#adb5bd" },
];

// Merchant → category rules distilled from the user's own history. Patterns are
// lowercase substrings matched against the transaction description.
const MERCHANT_RULES: Record<string, string> = {
  walmart: "Groceries",
  "wal-mart": "Groceries",
  "wal mart": "Groceries",
  "dollar tree": "Groceries",
  "dollar-tree": "Groceries",
  thrive: "Groceries",
  smiths: "Groceries",
  "smith's": "Groceries",
  maverik: "Gas",
  sinclair: "Gas",
  chevron: "Gas",
  "phillips 66": "Gas",
  holiday: "Gas",
  exxon: "Gas",
  "korner mart": "Gas",
  "fast gas": "Gas",
  tcees: "Fast Food",
  dominos: "Fast Food",
  mcdonald: "Fast Food",
  "chick-fil-a": "Fast Food",
  "chick fil a": "Fast Food",
  wendy: "Fast Food",
  "panda": "Fast Food",
  "little caesar": "Fast Food",
  "five guys": "Fast Food",
  subway: "Fast Food",
  culvers: "Fast Food",
  ihop: "Fast Food",
  chilis: "Fast Food",
  terrel: "Fast Food",
  spotify: "Subscriptions",
  apple: "Subscriptions",
  xbox: "Subscriptions",
  claude: "Subscriptions",
  "snow college": "School",
  clover: "School",
  paddle: "School",
  flatworld: "School",
  eventbrite: "School",
  primerica: "Bills",
  "select health": "Bills",
  intermountain: "Bills",
  "ephraim city": "Bills",
  "city of ephraim": "Bills",
  "dominion energy": "Bills",
  "eye center": "Bills",
  cinemark: "Entertainment",
  megaplex: "Entertainment",
  steam: "Entertainment",
  newegg: "Entertainment",
  "seat geek": "Entertainment",
  amazon: "Shopping",
  "amzn": "Shopping",
  shein: "Shopping",
  fabletics: "Shopping",
  etsy: "Shopping",
  target: "Shopping",
  burlington: "Shopping",
  "old navy": "Shopping",
  // Income — deposits of checks / paychecks.
  "mobile deposit": "Paycheck",
  "mobile check deposit": "Paycheck",
  "direct deposit": "Paycheck",
  "payroll": "Paycheck",
  "dmv": "Car",
  oreilly: "Car",
  "o'reilly": "Car",
  "tagg n go": "Car",
  "tag n go": "Car",
  wayfair: "Home",
  // Transfers / credit-card payoffs — excluded from income and spending.
  "credit card payment": "Credit Card Payment",
  "card payment": "Credit Card Payment",
  "payment thank you": "Credit Card Payment",
  "payment - thank you": "Credit Card Payment",
  autopay: "Credit Card Payment",
  "online payment": "Transfer",
  "mobile banking payment": "Transfer",
  "banking payment": "Transfer",
  "payment from savings": "Transfer",
  "payment from checking": "Transfer",
  "payment to savings": "Transfer",
  "payment to checking": "Transfer",
  "from savings": "Transfer",
  "to savings": "Transfer",
  "from checking": "Transfer",
  "to checking": "Transfer",
  "transfer to": "Transfer",
  "transfer from": "Transfer",
  "internal transfer": "Transfer",
  "web transfer": "Transfer",
  xfer: "Transfer",
  "online banking transfer": "Transfer",
};

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

async function main() {
  const nameToId: Record<string, string> = {};

  // Expense categories + this month's budget targets.
  let order = 0;
  for (const c of EXPENSE_CATEGORIES) {
    const cat = await prisma.category.upsert({
      where: { name: c.name },
      update: { color: c.color, sortOrder: order, kind: "expense" },
      create: { name: c.name, color: c.color, sortOrder: order, kind: "expense" },
    });
    nameToId[c.name] = cat.id;
    await prisma.monthlyBudget.upsert({
      where: { month_categoryId: { month: currentMonth(), categoryId: cat.id } },
      update: { limitCents: c.budget * 100 },
      create: { month: currentMonth(), categoryId: cat.id, limitCents: c.budget * 100 },
    });
    order++;
  }

  // Income categories.
  for (const c of INCOME_CATEGORIES) {
    const cat = await prisma.category.upsert({
      where: { name: c.name },
      update: { color: c.color, sortOrder: order, kind: "income" },
      create: { name: c.name, color: c.color, sortOrder: order, kind: "income" },
    });
    nameToId[c.name] = cat.id;
    order++;
  }

  // Transfer categories (excluded from all totals).
  for (const c of TRANSFER_CATEGORIES) {
    const cat = await prisma.category.upsert({
      where: { name: c.name },
      update: { color: c.color, sortOrder: order, kind: "transfer" },
      create: { name: c.name, color: c.color, sortOrder: order, kind: "transfer" },
    });
    nameToId[c.name] = cat.id;
    order++;
  }

  // Merchant auto-categorization rules (unbounded — min/max/sign null).
  for (const [pattern, categoryName] of Object.entries(MERCHANT_RULES)) {
    const categoryId = nameToId[categoryName];
    if (!categoryId) continue;
    const existing = await prisma.merchantRule.findFirst({
      where: { pattern, minAmountCents: null, maxAmountCents: null, sign: null },
    });
    if (existing) {
      await prisma.merchantRule.update({ where: { id: existing.id }, data: { categoryId } });
    } else {
      await prisma.merchantRule.create({ data: { pattern, categoryId } });
    }
  }

  // Conditional rules: bounded by amount and/or sign, layered on top of the
  // unbounded rules above (categorize() prefers the more specific match).
  type ConditionalRule = {
    pattern: string;
    categoryName: string;
    minAmountCents?: number;
    maxAmountCents?: number;
    sign?: "positive" | "negative";
  };
  const CONDITIONAL_RULES: ConditionalRule[] = [
    // Maverik is a gas station that also sells fast food; small charges are food.
    { pattern: "maverik", categoryName: "Fast Food", maxAmountCents: 1000 },
    // Venmo: money coming in is a paycheck-style payment, money going out is fun spending.
    { pattern: "venmo", categoryName: "Paycheck", sign: "positive" },
    { pattern: "venmo", categoryName: "Entertainment", sign: "negative" },
  ];
  for (const r of CONDITIONAL_RULES) {
    const categoryId = nameToId[r.categoryName];
    if (!categoryId) continue;
    const minAmountCents = r.minAmountCents ?? null;
    const maxAmountCents = r.maxAmountCents ?? null;
    const sign = r.sign ?? null;
    const existing = await prisma.merchantRule.findFirst({
      where: { pattern: r.pattern, minAmountCents, maxAmountCents, sign },
    });
    if (existing) {
      await prisma.merchantRule.update({ where: { id: existing.id }, data: { categoryId } });
    } else {
      await prisma.merchantRule.create({
        data: { pattern: r.pattern, categoryId, minAmountCents, maxAmountCents, sign },
      });
    }
  }

  const totalCats =
    EXPENSE_CATEGORIES.length + INCOME_CATEGORIES.length + TRANSFER_CATEGORIES.length;
  console.log(
    `Seeded ${totalCats} categories, ` +
      `${EXPENSE_CATEGORIES.length} budget targets for ${currentMonth()}, ` +
      `${Object.keys(MERCHANT_RULES).length + CONDITIONAL_RULES.length} merchant rules.`
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
