---
kind: note
topics: [ci, software-for-routine]
date: 2026-11-15
---
# Thousands-separator sweep, 2026-11-15

Tool: `platform/ci/check_thousands_input.mjs` (test: `platform/ci/test_check_thousands_input.mjs`).
For every venture page with a text input marked `inputmode="decimal"` or
`"numeric"`, it loads the page's own example, types `1200` and then `1,200`
into one input on fresh loads, presses the page's calculate button, and
compares the visible text with commas removed. A control load (`1200` twice)
skips pages whose text changes on its own; an input whose value never
reaches the visible text (blank and `1200` look the same) counts as inert,
not clean.

```
node platform/ci/check_thousands_input.mjs --out report.json          # all ventures, 3 inputs a page, ~10 min
node platform/ci/check_thousands_input.mjs --only <venture> --per-page 20
```

## First run (before fixes)

335 pages, 509 inputs probed (199 more inert), **111 inputs read "1,200"
differently from "1200"**, 20 skipped (17 nondeterministic text, 3 load
timeouts: tile-layout-planner, print-on-demand-profit-calculator,
maple-syrup-sugarbush-profit-calculator). By the changed line, 75 inputs on
42 ventures gave a *different answer with no warning*; 36 on 24 ventures
rejected the value with a message.

The cause is the same everywhere: `Number("1,200")` is `NaN` (the page then
falls back to a default or to "not entered") and `parseFloat("1,200")` is 1.

## Fixed in this PR (22 ventures)

Each page gets one `ungroup` helper that strips commas **only** when the text
is a well-formed grouped number (`^[+-]?\d{1,3}(,\d{3})+(\.\d*)?$`), so a
decimal-comma `1,5` still fails as before instead of becoming 15.

Silent before: bid-win-rate-optimizer, bundle-discount-optimizer,
contractor-wip-schedule, crew-dispatch-optimizer, era-835-underpayment-finder,
gabor-granger-price-analyzer, h1b-weighted-lottery-odds-calculator,
lead-response-time-analyzer, midterm-rental-calculator,
price-elasticity-estimator, project-estimate-calibrator,
renewal-rent-optimizer, rental-fleet-size-optimizer, rental-rent-optimizer,
service-van-stock-optimizer, str-nightly-rate-optimizer,
trial-conversion-timing-analyzer, shift-cover-optimizer.
Loud before, dollar fields: retirement-withdrawal-sequencer,
freelance-retainer-vs-hourly-calculator, ebike-rental-fleet-profit-calculator,
studio-class-slot-optimizer.

After: every one re-swept with `--per-page 20` reads both forms the same
(rental-fleet-size-optimizer showed one residual difference on its status
line; a direct Playwright check of `#lostCost` gave identical results for
`1200` and `1,200`, so that is the sweep's 150 ms wait against a slow
simulation). Each venture's own `node --test *.test.mjs` passes.

## Still open (next run)

Silent, mostly fields where a value over 999 is unlikely (percent, days,
seeds, column numbers) but the misread is still silent:
client-rebooking-predictor (horizon), coi-expiry-gap-checker (lead),
conformal-prediction-intervals (seed), continuous-beam-calculator (fD, fL;
`spans` is a comma list, a false positive), craft-brewery-batch-margin-calculator
(loss, hours, rate), eu-vat-oss-calculator (originrate),
freelance-contract-maker (f-depositPct), freelance-dashboard (rate),
freelance-proposal-maker (f-validDays, f-depositPct, f-payDays),
freelancer-tax-pack (x-rate), gtin-list-check and iban-list-check (column),
home-care-agency-margin-calculator (overheadPerHour),
landlord-repair-or-replace-planner (horizon, discount, shape),
league-schedule-generator and weekly-staff-schedule-maker and
wasserstein-distance (seed), private-practice-payer-mix-calculator
(sessionMinutes, notesMinutes, adminHourly), rent-increase-notice-checker
(cpi), seasonal-buy-quantity-optimizer (growth), str-turnover-scheduler
(cleaners, travel, rate), supplier-price-creep-checker (creep),
tournament-pairing-manager (rounds-total).

Loud (rejects with a message; a UX cost, not a wrong answer):
aba-authorization-tracker, ad-incrementality-test-analyzer,
appointment-overbooking-optimizer (revenue, vcost), ball-python-morph-pairing-planner,
beef-cattle-ration-optimizer (weight), certified-payroll-calculator/wh347-report.html,
event-seating-chart-optimizer, fertilizer-blend-optimizer (acres),
freelance-contract-maker (f-payDays), home-care-agency-margin-calculator,
isolation-forest, league-schedule-generator (rounds),
route-account-pruner, seasonal-buy-quantity-optimizer (price, salvage),
shift-roster-builder/shifts-from-sales.html (splh), survival-analysis (tau).

The sweep only reaches inputs whose value shows in the page text after the
page's first calculate-like button; the 199 inert inputs (often on pages that
need a pasted file first) are unchecked, not clean.
