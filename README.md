# Budget

A personal budget tracker that mirrors the monthly spreadsheet in
`reference/Budget.pdf`: a month-by-month view with **Date · Cost · Company ·
Category** and a **budget-vs-actual** panel per category, plus income tracking
and a running **net**.

Transactions come in four ways, all feeding the same tables:

- **CSV import** — export from your bank and upload (works today, any bank).
- **Manual entry** — add a row directly, just like the spreadsheet.
- **Plaid** — automatic bank sync (implemented; see below).
- **Teller** — alternative automatic sync (implemented; see below).

## Stack

- **Next.js (App Router) + TypeScript** — UI and API in one project.
- **Prisma + SQLite** — a single local database file (`prisma/dev.db`). Prisma
  ships prebuilt binaries, so there's no native-compile step on Windows.
- **papaparse** — CSV parsing.

## Setup

```bash
npm install            # also runs prisma generate
npm run db:push        # create the SQLite database from the schema
npm run db:seed        # load categories, budgets, and merchant rules
npm run dev            # http://localhost:3000
```

The first time you open the app it asks you to create an account (e.g. "Everyday
Checking" at America First Credit Union). After that you're on the monthly
dashboard.

## Setup on a new machine

Secrets and data are **not** in git (see `.gitignore`), so a fresh clone needs a
few local-only steps to become a working copy:

```bash
git clone https://github.com/Caelc2216/budget.git
cd budget
npm install            # installs deps + runs prisma generate
npm run db:push        # creates a fresh prisma/dev.db from the schema
npm run db:seed        # loads categories, budgets, and merchant rules
npm run dev            # http://localhost:3000
```

Then restore what git doesn't carry:

1. **`.env`** — recreate it (it's gitignored). At minimum set `DATABASE_URL`;
   add your Plaid and/or Teller keys to re-enable bank sync. A template:
   ```
   DATABASE_URL="file:./dev.db"
   PLAID_CLIENT_ID=""
   PLAID_SECRET=""
   PLAID_ENV="production"      # sandbox | production
   PLAID_WEBHOOK_URL=""        # leave empty; not needed for manual/scheduled sync
   NEXT_PUBLIC_TELLER_APPLICATION_ID=""
   TELLER_ENVIRONMENT="sandbox"
   TELLER_CERT_PATH=""
   TELLER_KEY_PATH=""
   ```
2. **Bank connections** — the database is fresh, so **re-link your banks**:
   open the dashboard → **🏦 Connect bank (Plaid)** and log in again. Plaid
   backfills your transaction history, and your seeded merchant rules
   auto-categorize them. (Plaid access tokens live only in the old machine's
   `dev.db`, so they don't transfer — you re-link rather than copy them.)
3. **Teller cert** (only if using Teller) — download your certificate/key from
   the Teller dashboard into `certs/` and point `TELLER_CERT_PATH` / `TELLER_KEY_PATH`
   at them.

To move your **existing data** to a new machine instead of re-linking, copy the
`prisma/dev.db` file over manually (it's intentionally not in git). Keep it
private — it contains your financial data.

## Using it

**Monthly dashboard** (`/`)

- Navigate months with **Prev / Next / Today**.
- Top row shows **Income · Spending · Net** for the month.
- The **Transactions** table matches your spreadsheet: Date, Cost, Company,
  Category. Change a category from the dropdown — it also *learns* that merchant
  so future imports categorize automatically. Add a row inline (use the `−/+`
  selector to mark it as spending or income).
- The **Budget** panel shows spent / limit per category with a progress bar
  (red when over). Click a limit to edit it for that month. Budgets **carry
  forward** — a new month inherits the previous month's targets until you change
  them.
- **Filter/sort** the table by company text, category, account, and min/max
  amount (filters apply within the selected month); click a column header to
  sort. The filter bar shows the matching count and total spend.
- **🔖 Remember** a categorization: after setting a row's category, click the
  bookmark to save a merchant → category rule. You confirm a short keyword
  (e.g. `maverik`) — the app guesses one from the noisy bank description — and it
  applies to existing matches and all future imports.
- **↻ Auto-categorize** re-applies all rules to this month's uncategorized rows.
- **Accounts** bar: add more accounts, or delete one (deleting removes its
  transactions, with a confirmation).

**Reports** (`/reports`)

- **Income vs. Spending** bar chart over the last 3/6/12 months (transfers
  excluded).
- **Spending by category** donut for the current month (use the ‹ ›
  arrows to step back through earlier months), with a percentage breakdown. Rendered as inline SVG — no external chart library.

**Manage** (`/manage`)

- **Categories** — add new ones (name, kind: expense/income/transfer, color),
  rename, recolor, change kind, or delete. Deleting a category makes its
  transactions uncategorized and removes its rules.
- **Rules** — view every learned merchant → category rule, add one directly
  (with "apply now" to backfill existing rows), or delete one.

**Import CSV** (`/import`)

1. Log in to your bank and export transactions as CSV for a date range.
2. Pick the account and (optionally) the bank format, then upload.
3. Columns are auto-detected (Date / Description / Amount, or split
   Debit/Credit). **Duplicates are skipped** by a fingerprint of
   date + amount + description, so re-importing overlapping ranges is safe.

### Bank CSV notes (America First / Mountain America)

The importer auto-detects columns, so most exports "just work." Credit-union
CSVs vary — if an import miscounts amounts or signs, save a sample file and the
preset in [`lib/banks.ts`](lib/banks.ts) can be pinned exactly (e.g. set
`amountIsPositiveSpend` if spending is exported as a positive number).

## Transfers between accounts

Moving money between your own accounts is **not** income or spending, and
counting it double-counts. Example: income lands in savings, you spend on a
credit card, then pay the card off from savings. The payoff shows up as a
"payment received" credit on the card and a withdrawal in savings — but the real
spending was already captured by the individual card purchases.

Categories with **kind `transfer`** (seeded: **Credit Card Payment**,
**Transfer**) are excluded from Income, Spending, Net, and budgets. The
dashboard shows the excluded transfer volume under Net for transparency.

Common payment/transfer descriptions auto-categorize (e.g. "CREDIT CARD
PAYMENT", "PAYMENT THANK YOU", "TRANSFER TO/FROM", "AUTOPAY"). For anything the
importer misses, just set its category to a transfer category from the dropdown —
and it will remember that merchant next time.

## Money & data conventions

- Amounts are stored as **integer cents**; **negative = spending, positive =
  income**. The budget panel shows spending as positive magnitudes.
- `prisma/dev.db` and any `.env` are **gitignored** — personal financial data is
  never committed.
- The database is backed up nightly to Google Drive, and the 3 most recent
  backups are kept. See [BACKUPS.md](BACKUPS.md) for setup and restoring.

## Data model

`Account → Transaction → Category`, with `MonthlyBudget` (per-category limit per
month), `MerchantRule` (learned merchant → category mapping), and `ImportBatch`
(one row per CSV upload, for review/rollback). Every transaction records its
`source` (`csv | manual | plaid`) so nothing downstream cares where it came
from — which is what makes Plaid a drop-in later.

## Automatic bank sync

Two providers are implemented and off until configured; the app runs fully on
CSV/manual without either. Both feed the same categorize + dedupe path as CSV,
and CSV stays available for any account a provider can't reach.

- **Teller** (free, no business onboarding) — **[TELLER.md](TELLER.md)**.
  Pull-based: **🔗 Connect bank (Teller)** enrolls an account; **↻ Sync Teller**
  or `scripts/teller-sync.ts` refresh it. Coverage as of this build: Mountain
  America ✅, America First ❌ (use CSV for America First).
- **Plaid** (webhook/push; Production needs a business-style application) —
  **[PLAID.md](PLAID.md)**. **🏦 Connect bank (Plaid)** links an item; Plaid
  pushes to `/api/plaid/webhook`, and **↻ Sync now** / `scripts/sync.ts` pull.

Provider linkage lives on `Account` (`plaid*` / `teller*` fields) and in the
`PlaidItem` / `TellerEnrollment` tables; every transaction records its `source`
(`csv | manual | plaid | teller`).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run db:push` | Sync schema to SQLite |
| `npm run db:seed` | Seed categories, budgets, merchant rules |
| `npm run db:studio` | Open Prisma Studio to browse the database |
