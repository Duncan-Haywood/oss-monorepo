# Mileage Deduction Method Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/mileage-deduction-method-calculator/>

A free browser calculator comparing the 2026 IRS standard mileage rate with
actual vehicle expenses for a self-employed person's business car. Entirely
client-side; nothing is uploaded.

After using this, you can now **see which vehicle deduction is larger for
your car in 2026 and roughly what it is worth in tax** -- using the two
mid-year 2026 rates instead of a single flat one.

## Figures (verified 2026-09-29)

Sources: IRS.gov "Standard mileage rates", Topic no. 510, Publication 463,
Announcement 2026-11 (via Littler and Journal of Accountancy).

- 72.5 cents per business mile, January 1 - June 30, 2026 (Notice 2026-10).
- 76 cents per business mile, July 1 - December 31, 2026 (Announcement
  2026-11, July 13, 2026).
- Parking and tolls are deductible on top of either method.
- Standard rate must be chosen in a car's first business year; unavailable
  for five or more cars at once or after MACRS/Section 179 on the car.

## Try it

Open [`index.html`](index.html), enter miles for each half of the year, total
miles and your car costs, then click **Compare methods**.

## What this does not cover

Employee expenses, MACRS/Section 179/bonus depreciation, luxury-car caps,
lease inclusion amounts, the Social Security wage-base cap and state tax.
Not tax advice. Tests: `node --test`.
