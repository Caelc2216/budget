// Back up the SQLite database to Google Drive and keep only the newest few.
//
//   npx tsx scripts/backup-db.ts
//
// Takes a consistent snapshot with `VACUUM INTO` (safe while the app is
// running), uploads it with rclone, then deletes older backups so only
// BACKUP_KEEP (default 3) remain.
//
// One-time setup on the hosting machine — see BACKUPS.md:
//   1. Install rclone (https://rclone.org/install/).
//   2. `rclone config` → create a Google Drive remote named "gdrive".
//
// Env:
//   BACKUP_REMOTE  rclone destination folder (default "gdrive:budget-backups")
//   BACKUP_KEEP    how many backups to keep   (default 3)
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const REMOTE = process.env.BACKUP_REMOTE || "gdrive:budget-backups";
const KEEP = Math.max(1, Number(process.env.BACKUP_KEEP) || 3);
const NAME_RE = /^budget-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z\.db$/;

function rclone(args: string[]): string {
  try {
    return execFileSync("rclone", args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error("rclone is not installed or not on PATH — see BACKUPS.md.");
    }
    throw err;
  }
}

async function main() {
  // e.g. budget-2026-11-03T08-00-00Z.db — sorts chronologically by name.
  const stamp = new Date().toISOString().replace(/\.\d+Z$/, "Z").replace(/:/g, "-");
  const name = `budget-${stamp}.db`;
  const dir = mkdtempSync(join(tmpdir(), "budget-backup-"));
  const file = join(dir, name);

  try {
    const prisma = new PrismaClient();
    try {
      // SQLite string literal: escape single quotes. Forward slashes work on Windows too.
      const target = file.replace(/\\/g, "/").replace(/'/g, "''");
      await prisma.$executeRawUnsafe(`VACUUM INTO '${target}'`);
    } finally {
      await prisma.$disconnect();
    }
    console.log(`Snapshot: ${name} (${(statSync(file).size / 1024).toFixed(1)} KB)`);

    rclone(["copyto", file, `${REMOTE}/${name}`]);
    console.log(`Uploaded to ${REMOTE}/${name}`);

    const existing = rclone(["lsf", "--files-only", REMOTE])
      .split(/\r?\n/)
      .filter((f) => NAME_RE.test(f))
      .sort();
    const stale = existing.slice(0, Math.max(0, existing.length - KEEP));
    for (const f of stale) {
      rclone(["deletefile", `${REMOTE}/${f}`]);
      console.log(`Deleted old backup ${f}`);
    }
    console.log(`Done — ${existing.length - stale.length} backup(s) kept.`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(`Backup failed: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
