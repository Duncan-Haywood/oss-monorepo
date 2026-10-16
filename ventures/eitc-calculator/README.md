# EITC Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/eitc-calculator/>

A free browser calculator for the federal Earned Income Tax Credit (EITC).
Entirely client-side; nothing is uploaded.

After using this, you can now **turn "how much did I earn, how many kids"
into an estimated EITC in seconds, including the two things people get
wrong by hand: the credit is looked up from BOTH earned income and AGI and
the smaller one wins, and the phase-out threshold is the same dollar figure
for 1, 2, or 3+ children** — arithmetic that otherwise means reading IRS
Publication 596's worksheet and hoping the AGI comparison and investment
income limit were both applied correctly.

## Why this exists

The EITC is the largest federal anti-poverty tax credit and is claimed by
tens of millions of filers every year, but its mechanics are widely
misunderstood, verified via WebSearch on 2026-09-25 against multiple
independent CPA/payroll-firm summaries of IRS Revenue Procedure 2025-32's
2026 inflation adjustments, cross-checked against each other:

- **The credit is computed twice, and the smaller wins.** IRS Publication
  596's own EIC Worksheet method looks the credit up once from earned
  income and once from AGI, using the identical phase-in/plateau/phase-out
  formula for each, and keeps the smaller result. A filer with modest
  earned income but higher AGI (investment income under the limit,
  unemployment, a working spouse on a joint return) can be phased out by
  AGI even though an earned-income-only lookup would suggest a larger
  credit.
- **The investment income limit is a flat disqualifier, not a phase-out.**
  $12,200 for 2026. Exceed it and the EITC is $0 regardless of how low
  earned income or AGI is.
- **The phase-out threshold does not rise with each additional child.**
  It is the same dollar figure ($23,890 single, $31,160 joint for 2026) for
  1, 2, or 3+ qualifying children — only the phase-out RATE and the
  completed-phaseout ceiling differ by child count. Only the 0-children
  category has its own, lower threshold.
- **Married filing separately is not always excluded.** A filer with a
  qualifying child who lived with them more than half the year AND who
  lived apart from their spouse for the last six months of the year (or is
  legally separated) can still claim it as if single.

## Try it

Open [`index.html`](index.html). Enter filing status, earned income, AGI
(if different from earned income), investment income, and the number of
qualifying children, then check the eligibility boxes that apply. Click
**Calculate**.

## What it calculates

All in [`calc.mjs`](calc.mjs), as pure functions with no dependencies:

- **`computeEitc`** — applies the filer-SSN-style eligibility checks
  (age 25-64 with no children, the MFS living-apart exception, the
  investment income limit), then the dual earned-income/AGI lookup, and
  returns the smaller result plus plain-English findings explaining every
  reduction.
- **`eicTableLookup`** — the phase-in/plateau/phase-out formula for a given
  income figure, number of qualifying children, and filing status, applied
  identically whether the input is earned income or AGI.

## What this does not cover

- Not a full tax return — no other deductions, credits, or state tax
  (many states offer their own EITC as a percentage of the federal one).
- Age, residency, relationship, and investment income are self-reported by
  the user, not verified against any external source.
- The qualifying-child tests themselves (relationship, residency, age,
  joint-return) are assumed already met — this tool does not determine who
  counts as a qualifying child.

## Disclaimers

Not legal, tax, or financial advice. This applies the published statutory
amounts, phase-in/phase-out formula, and eligibility rules to the numbers
and checkboxes you enter; it is not a substitute for reviewing IRS guidance
or consulting a qualified tax professional before filing.

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
