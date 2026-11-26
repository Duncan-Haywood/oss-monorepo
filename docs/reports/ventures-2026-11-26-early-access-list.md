---
kind: milestone
date: 2026-11-26
---
# Private early-access list for the paid products (2026-11-26)

Bet #1 (`portfolio/monetization/bets.md`). oss-monorepo PR #19269.

## Why this, this run

- PayApps' ROADMAP Next is mostly "if asked" items, and the live claims cover the rest. Several runs
  an hour are working on it.
- Its "Must do before a public launch" list comes down to one action: run `payapps-deploy`. Agents may
  do that under the owner's 2026-11-26 note in `private-monorepo/docs/legal/OPERATOR.md`, but no Actions
  runner has started a private-monorepo job since 2026-11-24, so the dispatch would fail. That is an
  owner item, already queued as `private-actions-billing` (#18753); it was not asked again.
- So the public side: the construction page's "Ask for early access" went to the **public feedback
  form**, whose text is committed to this repository. No contractor sends their billing setup through
  that, so the page captured no leads at all.

## What landed

- `platform/edge/early-access.mjs` on the live edge Worker:
  - `POST /early-access` takes a sign-up.
  - `GET /early-access/counts` is public and returns numbers only.
  - `GET /early-access` and `DELETE /early-access?email=` need `INBOX_TOKEN`.
  - Rows are stored in D1 and DynamoDB (`store.mjs`, `aws/dynamo-store.mjs`), checked by the contract
    test, and copied by `aws/migrate-d1.mjs`.
- `platform/pages/early-access-form.mjs` is the form, on `industries/construction/` first. Without an
  edge origin it falls back to `mailto:hello@`.
- Site Privacy Policy: the list, consent basis, one year.

## For the next run

- **Read demand:** `curl https://monorepo-projects-edge.duncan-andrew-haywood.workers.dev/early-access/counts`.
  It works once PR #19269's edge deploy has run. The rows need `INBOX_TOKEN`, which agents may not hold
  (owner step, `portfolio/distribution/SETUP.md` step 3). The owner can always read them in the D1
  console.
- **Put the form on more pages:** `products.mjs` (still mailto per line), the machine-shop and einvoice
  front doors, and the `pay-app-guides` CTAs. Keys are in `EARLY_ACCESS_PRODUCTS`; adding a product
  there is the only server change needed.
- **Copy the counts into `portfolio/usage/`:** the daily `site-usage-pull` workflow is the natural
  home, but that is a workflow change, so do it in its own PR.
- **At launch:** email each address once. Say why they are getting it and offer removal in one click,
  because the form cannot prove an address belongs to whoever typed it. This is not a marketing opt-in
  (`platform/edge/README.md`, "Early-access list").
