# Database backups

The app's data is a single SQLite file (`prisma/dev.db`) on the hosting laptop.
[`scripts/backup-db.ts`](scripts/backup-db.ts) copies it to Google Drive and
keeps only the **3 most recent** backups.

It runs:

- **Nightly** at 09:00 UTC, from [`.github/workflows/backup.yml`](.github/workflows/backup.yml).
  GitHub can start scheduled runs late, and pauses them if the repo has no
  pushes for 60 days. If that happens, re-enable the workflow on the Actions tab.
- **On every deploy**, before `prisma db push`, from [`deploy.yml`](.github/workflows/deploy.yml).
  A failed backup won't stop the deploy, but the step shows a warning.
- **By hand**: run `npx tsx scripts/backup-db.ts` in the app folder, or use
  "Run workflow" on the Backup database workflow in GitHub's Actions tab.

Backups are named like `budget-2026-11-03T09-00-00Z.db`, in UTC, in a Drive
folder called `budget-backups`. Deleted backups go to Drive's trash, and Drive
empties its trash after 30 days.

## One-time setup (on the hosting laptop)

1. **Install rclone:** see <https://rclone.org/install/>.
   - Windows: `winget install Rclone.Rclone`
   - macOS: `brew install rclone`
   - Linux: `sudo -v ; curl https://rclone.org/install.sh | sudo bash`
2. **Connect Google Drive:** run `rclone config`, sign in as the **same OS user
   the GitHub runner runs as**, and answer:
   - `n` (new remote), name: **`gdrive`**
   - Storage: **drive** (Google Drive)
   - client_id / client_secret: leave blank
   - scope: **`1`** (full access) or **`3`** (`drive.file`, which only sees files rclone created)
   - Use the defaults for everything else, then sign in to Google in the browser window that opens.
3. **Check it works:** from the app folder (the runner's `_work/budget/budget` folder), run:
   ```sh
   npx tsx scripts/backup-db.ts
   rclone lsf gdrive:budget-backups
   ```
4. **Restart the runner service** if you just installed rclone. Otherwise it
   may not see rclone on its `PATH`.

To use a different remote or folder, or keep a different number of backups,
set `BACKUP_REMOTE` (default `gdrive:budget-backups`) and `BACKUP_KEEP`
(default `3`) in the runner's environment.

## Restoring

```sh
pm2 stop budget
cp prisma/dev.db prisma/dev.db.before-restore          # keep the current copy, just in case
rm -f prisma/dev.db-wal prisma/dev.db-shm              # stale journal files, if any
rclone copyto gdrive:budget-backups/<backup-name>.db prisma/dev.db
pm2 start budget
```
