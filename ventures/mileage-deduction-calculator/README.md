# Mileage Deduction Calculator

A free browser calculator for a self-employed filer's 2026 business vehicle
deduction: standard mileage rate versus actual expenses. Entirely
client-side; nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/mileage-deduction-calculator/

After using this, you can now **see which vehicle deduction is larger for
2026 — standard mileage priced at the IRS's split-year rates, or actual
expenses at your business-use share** — which used to mean pricing miles
by hand at two different rates and re-deriving the business-use percentage.

## Why this exists

Verified 2026-09-29 via WebSearch and WebFetch against IRS.gov's
"Standard mileage rates" page, the IRS newsroom release for Notice 2026-10,
and the Journal of Accountancy's report on Announcement 2026-11:

- **Business rate: 72.5 cents/mile for January 1 – June 30, 2026, and 76
  cents/mile for July 1 – December 31, 2026.** The IRS raised the rate
  mid-year because of fuel prices. A calculator using a single rate is wrong
  for anyone who drove in both halves.
- Parking fees and tolls are deductible **on top of** the standard rate.
- The standard rate is not available if MACRS depreciation or a Section 179
  election was already claimed on the vehicle, for a leased car unless it
  applies for the whole lease, for five or more vehicles at once, or if the
  standard method was not chosen in the vehicle's first business year.

## Try it

Open [`index.html`](index.html). Enter business miles for each half of the
year, then optionally total miles and total vehicle costs to compare against
actual expenses.

## What it calculates

All in [`calc.mjs`](calc.mjs), pure functions, no dependencies:

- **`standardDeduction`** — miles × the rate for the period driven, plus
  parking and tolls.
- **`actualDeduction`** — vehicle costs × (business miles ÷ total miles),
  capped at 100%, plus parking and tolls.
- **`mileageDeductionOutcome`** — both, the difference, the larger method,
  and findings (eligibility limits, commuting, record-keeping).

## What this does not cover

Self-employed (Schedule C) filers only; depreciation and Section 179 are not
modelled (put them inside your actual-cost total); the depreciation portion
inside the standard rate is not computed; medical, moving and charity rates
are out of scope; figures are 2026 only. Not legal, tax, or financial advice.

## Privacy and usage

Runs in the browser; nothing is uploaded. Feature events are counted only in
local storage, honour Do Not Track / Global Privacy Control, and can be
turned off on the page.

## Tests

```
cd ventures/mileage-deduction-calculator && node --test
```

MIT licensed. Support via GitHub Sponsors is optional.
