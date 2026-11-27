---
kind: milestone
date: 2026-11-27
---
# grants: the paid path, adopted from a stranded PR (2026-11-27)

Private-monorepo PR #469 (merged, squash `5d072af8`), claim `claim/grants/paid-path-plan-changes`.
It replaces PR #25. That PR was opened on 2026-11-24, tested, and left as a draft for three days
while main moved about 440 PRs ahead. #25 is now closed.

## Why this one
`roadmap_claim.py --bets` found no free, ungated ROADMAP item on bets #1 to #6: everything waits on
demand, the owner or a deploy. Other sessions were already working on the two paid-bets work items,
moving PayApps public (#19586 and #19571) and the agent inboxes (#19588). Grant Autopilot (bet #7) is
the one bet that is already live, and bets.md says finishing its paid path is cheap. #25 had that work
built and tested, but it was invisible to every check because it was a stale draft.

## What landed
- **Plan changes in place:** `POST /billing/change-plan` (admin) sends a prorated Paddle PATCH. The
  plan changes only when the webhook arrives.
- **Checkout return:** `GET /api/billing/return` (the user's own checkout, a member still, under 24 h).
- **Seat limits:** invitations count members plus pending invitations; 3 seats before any plan.
- **Match preview:** 10 fit-scores, once, for an org that has never subscribed.
- **Readiness:** `hasPrice` and `billingReadiness`, and a `billing` check in `/api/health/deep`.
- **Docs:** `docs/GO-LIVE.md`.

## What had to change to land it
- **Five merge conflicts:** main had added the 40% margin floor, `assertCanRegenerate` and the fake
  billing webhook secret tests. Both sides were kept in every file.
- **GO-LIVE.md was written for a world that no longer exists.** It had $5/$20/$100 prices typed into
  Paddle by hand and a Starter quota of 1. It now says:
  - the deploy's "Sync the Paddle catalog" step creates the products and prices from
    `billing/paddle-catalog.json` and reads the price ids back;
  - the `BILLING_PRICE_IDS` secret is only a fallback;
  - the API key needs product and price permissions;
  - the prices are $10/$29/$149 and Starter allows 5 drafts.

  `pricing-doc.test.ts` holds its price table to `PLANS`.
- **The preview's cost was off by 40×.** The old branch used Opus prices ($0.017 a score). On
  Haiku 5.5, the cost model's `matchScore` is about $0.0004 a score, so a sign-up that never pays
  costs under a cent. PRICING.md's per-stage table (lines 82-91) still has the Opus figures, but the
  text above it says it is the Opus reference table, so it was left alone.

## Verification (local; private CI got no runners)
- `pnpm typecheck` and `biome check` on the 23 changed TS files: clean.
- `pnpm build`: clean, 22 of 22 pages prerendered.
- `pnpm test:worker`: 624 of 624 passed.
- `pnpm test:unit`: 1,659 passed, 1 failed.
  - The failure is `src/client/components/grants/pages.smoke.test.tsx`, "dashboard renders KPIs, …":
    it cannot find the "YouthBuild Construction Training" link.
  - It fails the same way on `origin/main` with this change stashed, so it was already broken.
  - It is probably date-dependent fixture data. That has not been checked; it is a good small fix
    for the next grants run.

## For the next run
- `git stash` during an unfinished merge drops `MERGE_HEAD`. The files survive, so the work landed
  as an ordinary commit, not a merge. Commit the merge before running anything on a stashed tree.
- What still stands between Grant Autopilot and a paying customer is only owner work:
  1. Paddle account verification;
  2. a GitHub secret `BILLING_API_KEY` with product, price, customer, subscription and transaction
     permissions;
  3. `BILLING_WEBHOOK_SECRET` and `BILLING_PROVIDER=paddle`;
  4. runners for private CI (decision queue `private-actions-billing` and `aws-turnover`).

  These are already queued, so they were not asked again.
