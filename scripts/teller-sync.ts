// Standalone Teller sync — run on a schedule (Windows Task Scheduler) or by hand:
//   npx tsx scripts/teller-sync.ts
// Teller is pull-based, so this is how you keep data fresh automatically.
import { prisma } from "../lib/db";
import { syncAllTeller } from "../lib/tellerSync";

async function main() {
  const results = await syncAllTeller();
  if (results.length === 0) {
    console.log("No Teller enrollments connected yet.");
    return;
  }
  for (const r of results) {
    console.log(`enrollment ${r.enrollmentId}: +${r.added} added, ${r.updated} updated`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
