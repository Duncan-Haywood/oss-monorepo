---
kind: note
subjects: [payapps, seller-books, security]
---
# One Paddle key for every deploy here, and a key check that can run

The owner, 2026-11-27: "there is a paddle secret don't know if it's the right type"
(`portfolio/ledger/asks.yaml`, `payout-rail`). Two things stopped that one secret from reaching checkout,
and both are fixed by PR #19717 (the allowlist, merged first) and the PR that adds this note:

1. **Each deploy read only its own name.** `priv-payapps-deploy.yml` read `PAYAPPS_BILLING_API_KEY`;
   `priv-seller-books-deploy.yml` read `SELLER_BOOKS_BILLING_API_KEY`. A single shared secret reached
   neither. Both deploys now read `<APP>_BILLING_API_KEY || BILLING_API_KEY || PADDLE_API_KEY`, in the
   catalog sync and in the Worker secret push. A per-app key still wins. One key serving every app
   is safe for the catalog: `paddle-catalog.ts` touches only items tagged `custom_data.app=<app>` and
   deletes nothing.
2. **The key check could not run.** `paddle-key-check.yml` was only in private-monorepo, where no job
   gets a runner (task `paddle-key-check`, `portfolio/work/tasks.yaml`). `priv-paddle-key-check.yml`
   ports it: manual, main-only, `contents: read`. It has one job per app, each in that app's deploy
   environment (`payapps-production`, `seller-books-production`), because an environment secret is
   invisible to a job outside it. Each job checks the three names its deploy reads, in order, and
   says which one the deploy would use. For each name it prints whether the key is set, its kind
   (live, sandbox, legacy, a Paddle.js client token, a notification secret) and which catalog calls
   Paddle refuses, using `ventures/payapps/packages/billing/scripts/paddle-key-check.ts`. The probe
   makes no writes and prints nothing past the key's public prefix.

Where to store the shared key: as `BILLING_API_KEY` in both environments, or once as a repository
secret, which the environment jobs also see (`docs/security/secrets-inventory.yaml`).

## What this does not do

- **Checkout stays dark** until `<APP>_BILLING_PROVIDER=paddle` (a repository variable) and a webhook
  secret are set. The webhook signing secret belongs to one Paddle notification destination, so it
  stays per app (`PAYAPPS_BILLING_WEBHOOK_SECRET`, `SELLER_BOOKS_BILLING_WEBHOOK_SECRET`). The next
  agent step is to create the destination from the deploy with the same API key (Paddle's
  notification-settings API returns its secret) and push the secret straight to the Worker. After
  that, the owner's whole job is one key.
- **Job Shop Quote** gets the same fallback, and a job in the key check, once its deploy lands
  (PR #19682). That needs an allowlist entry for its deploy file. The `JOBSHOP_BILLING_API_KEY`
  entry PR #19717 added for the key check goes unused until then.
- Grants, CMMC and E-invoice still deploy from private-monorepo, where Grants reads `BILLING_API_KEY`.
  Repository secrets do not cross repositories, so a key saved only in private-monorepo is not visible
  here.

## Answer (run 46006688313, 2026-11-27 13:24 UTC)

The owner's secret is **`PADDLE_API_KEY`**, and it is the right type. In both deploy environments it
reads as `live (prefix pdl_live_apikey_)`: a live Paddle Billing API key, the right kind for charging
real customers. Paddle allowed all four catalog calls the deploys make: list products, list prices,
create product and create price. `PAYAPPS_BILLING_API_KEY`, `SELLER_BOOKS_BILLING_API_KEY` and
`BILLING_API_KEY` are not set. Before PR #19731 no deploy read `PADDLE_API_KEY`, so the key had never
been used.

## For the next run

1. The next `payapps-deploy` and `seller-books-deploy` runs sync each app's `billing/paddle-catalog.json`
   to Paddle with that key and push it to the Worker. Checkout stays dark: `BILLING_PROVIDER` is still
   `none` and there is no webhook secret.
2. Webhook destinations as code: have the deploy create (or find) the Paddle notification destination
   for `<APP_URL>/api/billing/webhook` with the same key, and push its secret to the Worker. After
   that, the only step left before live checkout is `<APP>_BILLING_PROVIDER=paddle`, together with the
   launch review for live checkout (`prompts/goals.md`, "2026-11-26: agents approve launch").
3. Re-run `paddle-key-check` after any key change.

## Step 2 done for PayApps (2026-11-27, paddle-webhook-destination)

`payapps-deploy` now finds or creates the notification destination for
`https://payapps.marisstella.app/api/billing/webhook` with the same key and pushes its signing
secret to the Worker as `BILLING_WEBHOOK_SECRET` (code: `ventures/payapps/packages/billing/src/paddle-webhook.ts`,
script `scripts/paddle-webhook.ts`; rules in `apps/payapps/docs/BILLING.md`, step 4). The destination
stays inactive until `PAYAPPS_BILLING_PROVIDER=paddle`, so the switch is the last step. Unknown until
the first run after merge: whether the key has `notification_setting.read`/`.write` (the step warns
and names the permission if not). Read the deploy's summary line "Paddle notification destination".
Next: the same for `seller-books-deploy` (copy the two files into `ventures/seller-books/packages/billing`
and set its own event list), and the launch review for live checkout.

First live run (payapps-deploy 46027839041, 2026-11-27 15:52 UTC): the key may read and write
notification settings. The deploy **created** destination `ntfset_01m8evambp5mrdq1z9w7wsgack`
(inactive), but then refused the secret Paddle returned: the first version's check wanted
`pdl_ntfset_[A-Za-z0-9_]{16,}`, or the field was absent from the create response. The follow-up
(PR "paddle-webhook-destination part 2") accepts any `pdl_ntfset_…` value without whitespace,
re-reads the destination by id when the field is missing, and logs which case it was (length
and prefix only). The next deploy finds that destination instead of creating a second one.
