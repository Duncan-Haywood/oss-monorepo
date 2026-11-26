---
kind: polish
topics: [design]
date: 2026-11-26
---
# Polish 2026-11-26: thousands separators beyond construction

Track: polish/0. Item 1 of "Still weakest" in
`polish-2026-11-26-unseparated-money.md`: run the new raw-amount rule of
`phone-probe-check.mjs` over every industry in `front-doors.json`, not just
construction, and fix what it finds.

## Measured (`phone-probe-check.mjs --industry all`, 207 slugs, 390 × 844)

Before (`origin/main` 78b9b7bd0): **23 page failures** with money printed
without thousands separators, on 14 slugs (all online-sellers and
manufacturing front doors; none in eu-e-invoicing or nonprofits, and none
in construction, which the previous run cleared).

| page | before | after |
|---|---|---|
| 1099k-reconciliation-worksheet/ (findings) | 3 (`$14600.00`, …) | 0 |
| amazon-fba-calculator/ and 4 decision pages | 13 (`$3335.95`, `$5276.78`, `$4723.93`, …) | 0 |
| amazon-ppc-search-term-analyzer/ | 1, in the *pasted input* textarea | 0 (marked `data-raw-amount-ok`: it is the user's report, not our output) |
| cnc-machining-quote-calculator/ | 1 (`$1050.00`) | 0 |
| free-shipping-threshold-optimizer/ | 1 (`$1124.27`) | 0 |
| poshmark- and whatnot-sales-report-analyzer/ (copyable summary) | 4 | 0 |
| reseller-books/ (findings, summary) | 20 (`$9128`, `$38529`, …) | 0 |
| returns-policy-cost-analyzer/ | 2 | 0 |
| reverb-fee-calculator/ and consign page | 3 (`$1045.14`) | 0 |
| shopify-fee-calculator/ and 4 pages | 11 (`$3174.40`, `$1400.00`, …) | 0 |
| storage-auction-max-bid-calculator/ | 1 (`$1190.00`) | 0 |
| ticket-resale-profit-calculator/ (summary) | 1 (`$4730`) | 0 |
| where-to-sell-calculator/ | 6 (`$3300.00`, …) | 0 |

After: 0 raw-amount failures on the 14 slugs (re-probed from a fresh build).
The probe's other failures there (sideways swipes) are unchanged.

## What changed

- The page and engine formatters of the form `` `$${x.toFixed(2)}` `` and
  `"$" + Math.abs(x).toFixed(2)` in those 14 slugs (102 lines, 51 files) now
  use `toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })`.
  Lines that write sample CSV rows (`out.push([`, `it.push([`) were left
  alone: they mimic the marketplaces' own exports, which the parsers read.
- A few hand-written ones: `moneyLabel` in amazon-fba `calc.mjs`,
  `summaryText` in reseller-books, `summarizeSales` in ticket-resale (new
  `usd`), the rounded ask in reverb's counter-offer draft, the threshold
  label in free-shipping, cnc's `money(n, places)`.
- Static worked-example prose updated on three SEO pages
  (does-this-amazon-moq-still-pay, should-i-use-amazon-awd,
  should-i-consign-this-reverb-listing, should-i-offer-subscriptions-on-shopify).
- Test pins moved to the separated form (8 assertions in amazon-fba,
  reverb, shopify; reverb's `page.test.mjs` `money()` helper now formats like the page).

Tests: `python3 platform/ci/run_venture_tests.py --changed`, 35 suites, 0 failed.

## Still weakest, next

1. Carried: the sideways swipes (`polish-2026-11-26-phone-probe.md`, item 1),
   widest first. The all-industries run lists them in online-sellers too:
   whatnot-sales-report-analyzer's `#report` tables need ~800px in a 288px box,
   window-design-pressure-calculator's report 632px in 324px, walmart's
   decision pages 423 to 477px.
2. Pages that compute nothing over $1,000 at their defaults still use raw
   `toFixed(2)` formatters (about 100 more `calc.mjs` files); the probe only
   sees what the defaults print. A static grep check for the
   `` `$${…toFixed(2)}` `` pattern in front-door slugs would catch them all.
3. Carried: two-column amount grid for pay-application-generator's phone
   cards; change-order-margin-calculator has no "load example" button.
