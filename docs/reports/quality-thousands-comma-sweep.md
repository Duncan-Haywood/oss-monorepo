# Thousands commas in pasted lines: what is fixed, what is left

Agent doc for the next quality or polish run. Written 2026-11-11 (PR #14663).

## The defect

Many calculators read a textarea of `name, value, value, ...` lines. Three audits
(`portfolio/quality/audits/2026-11-07-med-spa-treatment-profit-calculator.json`,
`2026-11-09-handyman-minimum-job-calculator.json`,
`2026-11-10-tire-shop-ticket-margin-calculator.json`) found the same high-severity bug: the
line was split on every comma, so `"$1,200"` (what a spreadsheet's CSV export writes) and an
unquoted `1,200` both became two cells, and every later field shifted into the wrong column with
no warning.

## Fixed in PR #14663

- **Full fix** (quote-aware `splitCells` + `looksSplitNumber` column check, refused lines get a
  reason): `tire-shop-ticket-margin-calculator`, `handyman-minimum-job-calculator`,
  `med-spa-treatment-profit-calculator`.
- **Quoted and tab forms fixed** (`splitCells` only, exported, one test per suite): auction-car-flip,
  candle-batch-cost, car-wash-membership, container-load-planner, dj-gig-profit, dog-grooming-profit,
  family-child-care-time-space, freelance-rate-increase, house-cleaning-quote,
  laundromat-machine-payback, massage-therapist-profit, nsa-idr-offer, production-mix-optimizer,
  rental-fleet-size-optimizer, shift-roster-builder, shipping-box-size-optimizer,
  tattoo-piece-profit, wedding-photographer-profit. An *unquoted* `1,200` in these still splits:
  each needs its own column count passed to a `looksSplitNumber`-style check (copy it from the
  tire-shop `calc.mjs`) and a warning wired into its page.

## Not touched yet

These split on `/\t|,/` (tabs and commas at once), so even a tab paste of `1,200` splits:
`chiropractor-new-patient-roi-calculator/calc.mjs:20`, `fractional-executive-rate-calculator/calc.mjs:20`,
`grant-writer-proposal-price-calculator/calc.mjs:20`, `service-van-stock-optimizer/calc.mjs:63`,
`tile-layout-optimizer/calc.mjs:697`, `timber-sale-offer-checker/calc.mjs:39`.

Find more: `grep -lE 'line\.split\(","\)|split\(/\\t\|,/\)' ventures/*/calc.mjs` (only `calc.mjs` was
searched; `app.js` or inline page scripts may have the same pattern).

## A heuristic that was rejected

Refusing any `$NNN` cell followed by a three-digit cell broke an ordinary line in the tire-shop
suite (`Tires,$720,520,50,100`: a $720 price and a $520 cost). The kept rule is narrower: `$1`
or `$12` followed by three digits. An unquoted `1,200` with no `$` that still fits the column
count (for example a blank last field) cannot be told apart from two numbers; the labels now say
"write 1200, or put "1,200" in quotes".
