---
kind: note
subjects: [billing, paddle, payapps, seller-books]
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
   ports it: manual, main-only, `contents: read`. For each of `BILLING_API_KEY`, `PADDLE_API_KEY`,
   `PAYAPPS_BILLING_API_KEY`, `SELLER_BOOKS_BILLING_API_KEY` and `JOBSHOP_BILLING_API_KEY` it prints
   whether the key is set, its kind (live, sandbox, legacy, a Paddle.js client token, a notification
   secret) and which catalog calls Paddle refuses, with
   `ventures/payapps/packages/billing/scripts/paddle-key-check.ts`. The probe makes no writes and
   prints nothing past the key's public prefix.

## What this does not do

- **Checkout stays dark** until `<APP>_BILLING_PROVIDER=paddle` (a repository variable) and a webhook
  secret are set. The webhook signing secret belongs to one Paddle notification destination, so it
  stays per app (`PAYAPPS_BILLING_WEBHOOK_SECRET`, `SELLER_BOOKS_BILLING_WEBHOOK_SECRET`). The next
  agent step is to create the destination from the deploy with the same API key (Paddle's
  notification-settings API returns its secret) and push the secret straight to the Worker. After
  that, the owner's whole job is one key.
- **Job Shop Quote** gets the same fallback when its deploy lands (PR #19682). The allowlist already
  covers `JOBSHOP_BILLING_API_KEY` in the key check, not its deploy.
- Grants, CMMC and E-invoice still deploy from private-monorepo, where Grants reads `BILLING_API_KEY`.
  Repository secrets do not cross repositories, so a key saved only in private-monorepo is not visible
  here.

## For the next run

Dispatch `paddle-key-check` on `main` (Actions, or the GitHub MCP `actions_run_trigger`) and read its
job summary. If every name reads "not set", the owner's secret is in private-monorepo or under another
name: ask once, in `asks.yaml` `payout-rail`, for it to be saved here as `BILLING_API_KEY`.
