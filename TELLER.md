# Connecting banks with Teller (free)

Teller is a **free** bank API (no business onboarding) used here to auto-sync
transactions. It's **pull-based**: there's no push webhook for transactions, so
you refresh with **↻ Sync Teller** in the app or a scheduled `teller-sync.ts`.

The app works fully on CSV/manual without Teller; this is purely to automate.

> Coverage note: as of this build, Teller supports **Mountain America Credit
> Union** but **not America First Credit Union**. So the practical setup is
> Mountain America via Teller + America First via CSV. Re-check by running the
> Connect flow against each bank.

## How it fits together

```
Teller Connect (popup)  →  onSuccess gives an access_token
        →  POST /api/teller/enroll   (stores enrollment + accounts, initial sync)
   ↻ Sync Teller / scripts/teller-sync.ts  →  GET /accounts/:id/transactions
                                            →  categorize + dedupe + store
```

Synced rows go through the **same categorize + dedupe** path as CSV, so your
rules and transfer/income handling apply automatically.

## 1. Create a Teller application (free)

1. Sign up at <https://teller.io> and create an application.
2. Copy your **Application ID** into `.env`:
   ```
   NEXT_PUBLIC_TELLER_APPLICATION_ID="app_xxx"
   TELLER_ENVIRONMENT="sandbox"
   ```
3. Restart `npm run dev`. The **🔗 Connect bank (Teller)** button (Accounts bar)
   is now live. In **sandbox**, Teller provides test banks/credentials — no
   certificate needed.

## 2. Real bank data — add the client certificate (mTLS)

`development` and `production` environments require a **client TLS certificate**
(this is Teller's auth model instead of a simple API key).

1. In the Teller dashboard, generate/download your **certificate** and
   **private key** (PEM files).
2. Put them somewhere gitignored, e.g. a `certs/` folder (already ignored), and
   point `.env` at them:
   ```
   TELLER_ENVIRONMENT="development"     # free, real data
   TELLER_CERT_PATH="./certs/teller_certificate.pem"
   TELLER_KEY_PATH="./certs/teller_private_key.pem"
   ```
3. Restart the dev server, then click **Connect bank (Teller)** and log into your
   real bank. `development` is free and uses real data (with per-account limits
   well above your two accounts).

## 3. Keep it fresh automatically

Teller is pull-based, so schedule a periodic sync. On Windows, create a **Task
Scheduler** task that runs, in the project folder:
```
npx tsx scripts/teller-sync.ts
```
e.g. once or twice a day. It needs no server running. You can also click
**↻ Sync Teller** anytime.

## Security notes

- Access tokens live in the local SQLite DB (`prisma/dev.db`, gitignored). The
  mTLS cert/key live under `certs/` (gitignored). Keep both private.
- The Application ID is public by design (it's used in the browser widget); the
  certificate/key are the real secrets.

## Money convention

Teller reports `amount` already signed as **negative = money out (spending),
positive = money in** — the same convention the app stores, so no sign flipping
is needed (unlike Plaid).
