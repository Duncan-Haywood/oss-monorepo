# Self-Employment Tax Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/self-employment-tax-calculator/>

A free browser calculator for 2026 **self-employment tax** (Schedule SE) for
freelancers, sole proprietors and gig workers. Entirely client-side; nothing
is uploaded.

After using this, you can now **see your SE tax, the deductible half, the
effect of W-2 wages and the Social Security wage base, and the percent of each
payment to set aside** — which used to mean working Schedule SE and Form 8959
by hand or guessing "30%".

## Rules applied (verified 2026-09-29: IRS Tax Topic 554, SSA 2026 figures)

- Net earnings = 92.35% of net profit; SE tax applies at $400 or more.
- 12.4% Social Security up to the $184,500 wage base (reduced by W-2 wages),
  plus 2.9% Medicare on all net earnings.
- One-half of SE tax is deductible in figuring AGI.
- Additional Medicare Tax 0.9% over $200,000 single / $250,000 joint /
  $125,000 separate (SE threshold reduced by wages).

## What this does not cover

Tax years other than 2026; clergy, farm and partnership income; the standard
deduction, QBI, credits, other income and state tax in the set-aside estimate.
Not tax advice.

## Run

Static ES modules, no build step: open `index.html`, or `node --test`.
MIT licensed; support is optional via GitHub Sponsors.
