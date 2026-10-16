# Home Office Deduction Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/home-office-deduction-calculator/>

A free browser calculator comparing the IRS **simplified** home office
deduction with the **regular (Form 8829)** method for a self-employed
filer. Entirely client-side; nothing is uploaded.

After using this, you can now **see which method deducts more and saves
more tax on your own numbers** — including the gross income limit applied in
Form 8829's own order, home depreciation, and what carries forward — which
used to mean filling in Form 8829 by hand.

## Rules applied (verified 2026-09-29 against IRS.gov)

- Simplified: $5 per sq ft, max 300 sq ft ($1,500), no depreciation, no
  carryover of amounts above the gross income limit.
- Regular: business share of actual expenses. Mortgage interest and real
  estate taxes first, then operating expenses, then depreciation, each
  limited by gross income less other business expenses; the excess of
  operating and depreciation carries forward.
- Depreciation: 39-year mid-month, 2.564% full year, month table for the
  first year, on the lesser of basis and value, excluding land.
- Employees cannot deduct home office expenses.

## What this does not cover

Employees, daycare, storage-only and multiple-home cases; whether your space
meets exclusive-and-regular-use; QBI, the Social Security wage base, the
SALT cap and state tax in the tax estimate. Not tax advice.

## Run

Static ES modules, no build step: open `index.html`, or `node --test`.
MIT licensed; support is optional via GitHub Sponsors.
