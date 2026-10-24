# Roth Conversion Bracket-Fill Calculator

A free browser calculator for 2026 **Roth conversions**. Enter your income
before converting and a target bracket; it returns the exact conversion that
fills the bracket, the federal tax it costs, what every bracket would allow,
and how many years a traditional IRA balance takes at that pace. Entirely
client-side; nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/roth-conversion-bracket-fill-calculator/

It also models two traps most conversion calculators miss:

- **Senior-deduction phase-out (65+, tax years 2025-2028).** The $6,000
  deduction shrinks 6 cents per dollar of income over $75,000 single /
  $150,000 joint, so converted dollars there cost the bracket rate x 1.06.
- **Medicare IRMAA cliff.** Over $109,000 single / $218,000 joint of MAGI
  (2026 tier) a conversion raises Part B and D premiums two years later.

## Rules applied (verified 2026-09-29)

Rev. Proc. 2025-32 brackets and standard deductions (via the Tax Foundation
table), the additional 65+ standard deduction, and the 2026 IRMAA first tier.

## What this does not cover

Years other than 2026; capital-gains stacking, taxable Social Security, NIIT,
state tax, credits, AMT; MAGI add-backs. Not tax advice.

## Run

Static ES modules, no build step: open `index.html`, or `node --test`.
MIT licensed; support is optional via GitHub Sponsors.
