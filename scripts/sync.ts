// Standalone Plaid sync — run on a schedule (Windows Task Scheduler) or by hand:
//   npx tsx scripts/sync.ts
// Pulls incremental transactions for every connected Plaid item. Does not need
// the web server running; it talks to Plaid and the local database directly.
import { prisma } from "../lib/db";
import { syncAllItems } from "../lib/plaidSync";
import { plaidConfigured } from "../lib/plaid";

async function main() {
  if (!plaidConfigured()) {
    console.error("Plaid not configured (set PLAID_CLIENT_ID / PLAID_SECRET). See PLAID.md.");
    process.exit(1);
  }
  const results = await syncAllItems();
  if (results.length === 0) {
    console.log("No Plaid items connected yet.");
    return;
  }
  for (const r of results) {
    console.log(
      `item ${r.itemId}: +${r.added} added, ${r.modified} modified, ${r.removed} removed`
    );
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
