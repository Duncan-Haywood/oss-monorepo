---
kind: milestone
date: 2026-11-27
---
# einvoice-site: the vendor API page now matches the shipped `api` plan (2026-11-27)

Bet #3 (e-invoice fix-and-explain), ROADMAP Next item 8, site side. Private PR
Duncan-Haywood/private-monorepo#472 (merged).

## What changed

- `apps/einvoice-site` API page (de/fr/en): a validation-only section naming `explain=0`
  (response shape, billing: a failing file stays a validation unit, `explain=0&fix=1` refused);
  "how usage is counted and billed" (one unit per file and month by SHA-256; the €19 minimum
  paid in advance and credited; usage above it charged once with the next renewal;
  `x-usage-amount-cents`, `GET /v1/billing/usage`, `GET /v1/account`; the safety caps); and the
  early-access form on the page with "software vendor" pre-selected (`form({ role })`).
- The page and docs/PRICING.md had said "billed monthly in arrears", which was wrong for the
  minimum (paid in advance through the subscription). Both corrected.
- llms.txt names explain=0.

## For the next run

- Item 8 left: the settlement cron (after the deploy) and the API page's link to the plan's
  sign-up at `/app` once the owner has run the deploy workflow (item 1). Nothing else on the
  einvoice ROADMAP is free and ungated; `roadmap_claim.py --bets` said so for all seven bets.
- Viewing einvoice-site's `dist/` over `file://` loses `/site.css` and reports a false
  horizontal scroll; serve `dist/` over HTTP (`python3 -m http.server`) before measuring.

## Verification

`node --test test/*.test.mjs` (einvoice-site): 37 pass. `biome check apps/einvoice-site`:
clean. `node --test pro/plans.test.mjs pro/metered-api.test.mjs`: 11 pass. Chromium 390 px
over HTTP, de/fr/en `/api/`: scrollWidth 390, vendor radio checked. The PR's CI jobs never got
a runner (`ci_starvation.py`, both runs starved), so these local runs are the verification.
