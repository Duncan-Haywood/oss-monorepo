# Self-Employed Health Insurance Deduction Calculator

A free browser calculator for the 2026 self-employed health insurance
deduction (IRC section 162(l), Form 1040 Schedule 1 line 17, Form 7206) for a
sole proprietor or single-member LLC. Entirely client-side; nothing is
uploaded.

After using this, you can now **see how much of your health, dental and
long-term-care premiums you can deduct for 2026 — and whether the
earned-income cap or an employer-plan month is what limits it** — which used
to mean working through Form 7206 line by line, including the
self-employment-tax and retirement-contribution subtractions.

## Figures and sources (verified 2026-09-28)

- **2026 Social Security wage base: $184,500** — SSA
  (ssa.gov/oact/cola/cbb.html and the SSA FAQ on maximum taxable earnings).
- **2026 long-term-care premium limits (IRC 213(d)(10))**, per person by age
  before year end: $500 (40 or younger), $930 (41-50), $1,860 (51-60),
  $4,960 (61-70), $6,200 (71 or older) — Rev. Proc. 2025-32 section 4.27,
  read from Internal Revenue Bulletin 2025-45 and matched by a second summary
  source.
- **Self-employment tax**: 92.35% of net profit; 12.4% Social Security up to
  the wage base (less W-2 Social Security wages), 2.9% Medicare uncapped; half
  is deductible; none under $400 of net earnings (IRC 1402(b)(2)). The
  additional 0.9% Medicare tax is not modelled.
- **Deduction rule**: the smaller of qualifying premiums and earned income
  (net profit minus deductible half of SE tax minus your own
  SEP/SIMPLE/qualified-plan contribution); no deduction for any month you or
  your spouse were eligible for an employer-subsidized plan, tested
  separately for plans with and without long-term-care coverage; Medicare
  premiums you pay voluntarily count — Instructions for Form 7206 and IRS
  guidance on self-employed retirement contributions.

## What this does not cover

- Sole proprietor / single-member LLC (Schedule C) only. Partners, LLC members
  taxed as partnerships and more-than-2% S-corporation shareholders differ
  (K-1 earnings, guaranteed payments, premiums reported in W-2 wages) and are
  not modelled.
- The circularity between a retirement contribution and the deduction is
  **not solved**: the contribution you enter is subtracted as given.
- Months of employer-plan eligibility remove months/12 of premiums, assuming
  even monthly payments; Form 7206 works month by month.
- Multiple businesses, Form 2555, the additional Medicare tax, dependents'
  long-term-care premiums (only you and a spouse are modelled), and the
  itemized-medical-expense treatment of premiums not deducted here.
- Point-in-time 2026 figures; they re-index annually.

## Disclaimers

Not legal, tax, or financial advice. It applies published 2026 figures to the
numbers you enter and is no substitute for Form 7206, its instructions, or a
qualified tax professional.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) never
changes what this tool does.

## Privacy

Everything runs in your browser. Nothing you enter is uploaded. Anonymous
feature events (`deduction_calculated`, `example_loaded`) are counted in
`localStorage` only, never transmitted; Do Not Track and Global Privacy
Control are honoured, and a button turns counting off.

## Development

```sh
node --test
```
