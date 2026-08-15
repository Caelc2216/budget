# Connecting banks automatically with Plaid

The app works fully on CSV import + manual entry. Plaid adds **automatic**
transaction syncing. This guide takes you from zero to a working **webhook**
(push) setup in Sandbox, then to real banks in Production.

Everything here is optional and additive — nothing about CSV changes.

## How it fits together

```
Plaid Link (popup)  →  /api/plaid/exchange  →  stores access_token + accounts
                                             →  initial sync pulls transactions
        Plaid  →  (new data)  →  POST /api/plaid/webhook  →  transactions/sync
                                                          →  categorize + store
```

- **PlaidItem** holds the access token and a sync cursor (one per bank login).
- **/api/plaid/webhook** is what makes it "push": Plaid calls it when new
  transactions are available, and we pull the delta via `transactions/sync`.
- Synced rows go through the **same categorize + dedupe** path as CSV, so
  auto-categorization and your remembered rules apply automatically.

## 1. Get Plaid keys (free)

1. Sign up at <https://dashboard.plaid.com>.
2. Copy your **client_id** and **Sandbox secret** (Team Settings → Keys).
3. Put them in `.env`:
   ```
   PLAID_CLIENT_ID="..."
   PLAID_SECRET="..."        # sandbox secret to start
   PLAID_ENV="sandbox"
   ```
4. Restart `npm run dev`.

The dashboard's **🏦 Connect bank (Plaid)** button (in the Accounts bar) is now
live. In Sandbox, use the test credentials `user_good` / `pass_good`.

## 2. Make the webhook reachable (local dev)

Webhooks are HTTP calls **from Plaid to your machine**, so your app needs a
public URL. Locally, tunnel with [ngrok](https://ngrok.com):

```bash
ngrok http 3000
```

Copy the https URL it prints and set:
```
PLAID_WEBHOOK_URL="https://<your-id>.ngrok-free.app/api/plaid/webhook"
```
Restart the dev server so new Link tokens register that webhook.

Test it without waiting for real activity — fire a Sandbox webhook:
```bash
# after connecting an item, trigger a sync event
curl -X POST https://sandbox.plaid.com/sandbox/item/fire_webhook \
  -H 'Content-Type: application/json' \
  -d '{"client_id":"'"$PLAID_CLIENT_ID"'","secret":"'"$PLAID_SECRET"'",
       "access_token":"<ACCESS_TOKEN>","webhook_code":"SYNC_UPDATES_AVAILABLE"}'
```

You can always pull on demand with **↻ Sync now**, or from a terminal:
```bash
npx tsx scripts/sync.ts
```

## 3. Go live with your real banks (Production)

1. In the Plaid dashboard, request **Production** access and complete the
   use-case application.
2. Confirm **America First CU** and **Mountain America CU** are supported
   (search them in Plaid's institution coverage). If one isn't, keep using CSV
   for that account — they coexist.
3. Swap `.env` to your Production secret and `PLAID_ENV="production"`, host the
   app at a stable public URL, and point `PLAID_WEBHOOK_URL` at it.

## 4. Scheduled fallback (optional)

Even with webhooks, a periodic pull is a good backstop. On Windows, create a
**Task Scheduler** task that runs:
```
npx tsx scripts/sync.ts
```
in the project folder (e.g. daily). It needs no server running and uses the
stored cursor, so it only fetches new data.

## Security notes

- `access_token`s live in the local SQLite DB (`prisma/dev.db`), which is
  gitignored. Keep that file private.
- This local setup skips **webhook signature verification**. Before exposing a
  real Production webhook, verify the `Plaid-Verification` JWT in
  `app/api/plaid/webhook/route.ts` (see Plaid's "Webhook verification" docs).
