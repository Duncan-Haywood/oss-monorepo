---
kind: note
date: 2026-11-28
subjects: [cmmc, payapps, jobshop-quote, seller-books, einvoice-pro]
topics: [guardrails, llms-txt, ci]
---
# Price claims match the catalog (2026-11-28)

**What:** `platform/ci/check_price_claims.py` (tests: `test_check_price_claims.py`, gate:
`.github/workflows/price-claims-ci.yml`). It reads every paid app's
`ventures/<v>/apps/<app>/src/shared/plans.ts` (`PLAN_LIST`: name, `priceCents`,
`annualPriceCents` or `annualPriceFor(n)`) and flags any line in that venture's shipped files, or in
a `docs/posts/` post naming the product, that puts a plan's name right next to a dollar figure the
plan does not charge (monthly, annual, or annual / 12).

**Why:** prices are retyped by hand into site meta descriptions, `llms.txt`, READMEs,
`VENTURE.yaml` and posts (PayApps' Crew $179 sat in 19 shipped files). The sites' own
`plans-sync` tests guard the plan *tables*; nothing guarded the prose. A price change would have
left copy promising a price checkout does not charge (`prompts/goals.md`, "Honest marketing").

**What it found on its first run (fixed in the same PR):**

- `ventures/cmmc/apps/cmmc-site/src/pages.mjs`, pre-launch pricing branch (built whenever
  `APP_URL` is empty; the tests build both states): still the 2026-11-24 proposal, Level 1 $39,
  Level 2 $149, Level 2 + Quality $249, and "a Level 2 shop pays less than FutureFeed", false at
  the catalog's $249 against FutureFeed's about $183. It now renders the catalog's plans
  (`publicPlans()`), and `test/site.test.mjs` asserts $249/$399 and no $39/$149 in that state too.
  The live page (`marisstella.app/cmmc/pricing`, the open state) was already right.
- `ventures/cmmc/apps/cmmc-site/docs/PRICING.md`: the same proposal, now marked superseded with
  the catalog prices up top (`price-claims: historical` skips the rest).
- `ventures/cmmc/apps/cmmc/ROADMAP.md` said the old prices "no longer appear anywhere"; corrected.
- One false positive, a dated history line in `payapps-site/docs/PRICING.md`, waived on the line.

**Reach:** 50 claims recognised in 18 venture files at 0 disagreements after the fixes; the old
`pages.mjs` gives exactly its three stale figures. Products: payapps, jobshop-quote, cmmc,
seller-books, and since the later same-day extension below, einvoice-pro.

**Limits, for the next run:** it only reads a figure adjacent to the exact plan name ("Level 2
self-assessment $149" is not read as Level 2). Plans named "Free" or "Complimentary" are not
checked (everyday words). It does not check feature claims (seats, job limits); that would be the
next extension, from the same `PLAN_LIST` fields. Waivers: `price-claims: ok` on a line,
`price-claims: historical` in a file's first 10 lines.

## Extension: euro prices and catalog-only products (2026-11-28, later)

E-invoice Fix & Explain (bet #3) has no `plans.ts`: its tiers live in
`apps/einvoice-site/content/pricing.mjs` and the deploy syncs
`apps/einvoice-preflight/billing/paddle-catalog.json` to Paddle, in euros. The checker skipped it.
Now a venture with no `plans.ts` is read from `billing/paddle-catalog.json` (name, `monthlyCents`,
`annualCents`, `currency`), and money is read as `€19`, `EUR 19` and `19 €` / `19,00 €` as well as
dollars. A figure in the wrong currency for its plan ("Firm S $19") counts as a disagreement.
Plans named "metered" are skipped: the API plan's catalog price is a €19 minimum and its copy
quotes per-unit rates (€1.40 per 1,000), which the first run flagged in `LAUNCH-REVIEW.md`.

Reach after the change: 67 claims in 25 files across five products, 0 disagreements (einvoice-pro
8 claims in 3 files: the venture README, `docs/BILLING.md`, `docs/LAUNCH-REVIEW.md`). Changing
the README's "Firm S €19" to €25 is flagged. The workflow's sparse checkout and venture list now
include `paddle-catalog.json`, so a catalog-only venture is checked in CI, not skipped silently.

Still open: the German, French and Dutch tier names (Kanzlei S, Cabinet S, Kantoor S) are not
read; the site renders those prices from `pricing.mjs`, so no hand-typed copy carries them today.
Feature claims (seats, job limits) are the next extension, as above; a grep on 2026-11-28 found
them only in tables that already agree.
