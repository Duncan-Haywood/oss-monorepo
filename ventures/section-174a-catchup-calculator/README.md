# Section 174A Catch-Up Deduction Calculator

A free browser calculator for the Section 174A domestic research and
experimental (R&E) catch-up deduction created by the One Big Beautiful Bill
Act (OBBBA). Entirely client-side; nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/section-174a-catchup-calculator/

After using this, you can now **compare the actual cash tax savings and
present value of the two catch-up elections available on your 2025 return —
deducting your entire remaining unamortized R&E balance in 2025, or
spreading it over 2025 and 2026 — and get a plain-language recommendation
based on your own income and rate expectations**, which used to take reading
several CPA-firm explainers of Rev. Proc. 2025-28 and building your own
spreadsheet to model the two paths side by side.

## Why this exists

Eligible small businesses that capitalized and amortized domestic R&E costs
from 2022-2024 under the old Section 174 rules face a real, current decision
on their 2025 return: take the whole remaining catch-up deduction in 2025,
or split it across 2025-2026 (Rev. Proc. 2025-28). Verified via WebSearch on
2026-09-25 against the IRS's own Rev. Proc. 2025-28, BDO's and Grant
Thornton's summaries of that guidance, RSM US's coverage of the
acceleration-election procedures, CalCPA's "Navigating Sect. 174A Elections
After OBBBA", Brady Ware's and Strike Tax's OBBBA/174A explainers, and
Hungerford's "Big Changes to Section 174 Treatment Under the 2025 Tax Act":

- **This is a real financial tradeoff, not a formality.** Taking it all in
  2025 front-loads the tax savings — better if 2025's rate or income is
  expected to be higher than 2026's. Spreading it out is better if 2025 is a
  loss or near-breakeven year, or the rate is expected to rise in 2026.
- **A deduction bigger than a year's taxable income does not vanish, but it
  also does not produce an immediate cash saving that year.** It can create
  or increase a net operating loss (NOL) instead — a real but generally
  less valuable outcome than an immediate reduction in tax owed, and one
  this calculator flags rather than silently ignores.
- **This is not the retroactive-amendment path.** A separate election to
  amend 2022-2024 returns directly existed under the same Rev. Proc., but
  its window closed July 6, 2026 — in the past as of this tool's build date.
  The live choice today is only the 1-year-vs-2-year election on the 2025
  return, which is what this calculator models.

## Try it

Open [`index.html`](index.html). Enter your remaining unamortized R&E
balance, expected 2025 and 2026 taxable income before this deduction, your
marginal or effective rate for each year, and optionally a discount rate.
Click **Calculate**.

## What it calculates

All in [`calc.mjs`](calc.mjs), as pure functions with no dependencies:

- **`compareCatchUpPaths`** — runs both the 1-year and 2-year election
  paths: the actual current-year cash tax saving each year (capped at that
  year's taxable income before the deduction, with an NOL flag when the
  deduction exceeds it), the present value of the combined savings across
  both years at a chosen discount rate, and the dollar/percentage
  difference between the two paths.
- **`usableDeduction`** / **`computeYearOutcome`** — cap a requested
  deduction at a year's available taxable income and compute the resulting
  cash tax saving.
- **`presentValue`** — discounts a sequence of year-0/year-1 cash flows at
  an annual rate.

## What this does not cover

- Not a full tax return — no other deductions, credits, self-employment or
  payroll tax, AMT, or state tax (state conformity to Section 174A varies).
- Does not verify small-business eligibility — the $31 million
  average-gross-receipts test for 2022-2024 is confirmed by you, not
  checked here.
- No net operating loss (NOL) carryforward modeling — a deduction exceeding
  a year's income is flagged, but its later-year carryforward value, the
  Section 172(a) 80%-of-taxable-income limitation, and state NOL rules are
  not estimated.
- Does not model the retroactive-amendment election to 2022-2024 returns —
  that window closed July 6, 2026.

## Disclaimers

Not legal, tax, or financial advice. This applies the two published Rev.
Proc. 2025-28 catch-up election structures to the numbers you enter; it is
not a substitute for reviewing IRS guidance or consulting a qualified tax
professional.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) never
changes what this tool does.

## Privacy

Everything runs in your browser. The numbers you enter are **never
uploaded** — there is no server component at all. Anonymous feature events
(`estimate_calculated`, `example_loaded`) are counted in `localStorage`
only, never transmitted. Do Not Track and Global Privacy Control are
honoured, and a button on the page turns counting off entirely.

## Development

```sh
node --test
```

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). The calculator and its
test suite are done; no external user contact has happened yet — see
`kill_criteria` in `VENTURE.yaml`.
