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
seller-books (einvoice-preflight has no `PLAN_LIST` yet; its post names are already in `POST_NAMES`).

**Limits, for the next run:** it only reads a figure adjacent to the exact plan name ("Level 2
self-assessment $149" is not read as Level 2). Plans named "Free" or "Complimentary" are not
checked (everyday words). It does not check feature claims (seats, job limits); that would be the
next extension, from the same `PLAN_LIST` fields. Waivers: `price-claims: ok` on a line,
`price-claims: historical` in a file's first 10 lines.
