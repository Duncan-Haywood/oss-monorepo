# STR Tax Loophole Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/str-tax-loophole-calculator/>

A free browser calculator for short-term-rental owners. Entirely
client-side; nothing is uploaded.

After using this, you can now **see whether your Airbnb or VRBO loss can
offset your other income in 2026, and how much a cost segregation study
adds in year one** -- on the non-passive path and on the passive path.

## Figures (verified 2026-09-29)

Sources: IRS Publication 925 and Publication 527 (2025 editions), Treasury
Regulation 1.469-5T, IRS bonus-depreciation release and Notice 2026-11,
Rev. Proc. 2025-32.

- Not a "rental activity": average stay 7 days or less, or 30 days or less
  with significant personal services. Average = total rental days / stays.
- Material participation tests 1-3 computed (500 hours; substantially all;
  more than 100 hours and not less than any other individual). Spouse hours
  count.
- $25,000 allowance for active participation, rental real estate only,
  phasing out 50 cents per dollar of MAGI from $100,000 to $150,000 (MFS
  apart: $12,500, $50,000-$75,000; MFS together: $0). Not indexed.
- 100% bonus depreciation for property acquired after January 19, 2025.
- 27.5-year (or 39-year) straight-line, mid-month; land not depreciable.
- Excess business loss threshold 2026: $256,000 single / $512,000 joint.

## Try it

Open [`index.html`](index.html), fill in the four sections, and click
**Check my rental**.

## What this does not cover

Tests 4-6 and the facts-and-circumstances participation test, real estate
professional status, pre-2025 acquisitions, state conformity, Section 199A,
recapture at sale. Not tax advice. Tests: `node --test`.
