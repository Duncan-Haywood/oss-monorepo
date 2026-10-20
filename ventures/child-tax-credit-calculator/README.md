# Child Tax Credit Calculator

A free browser calculator for the federal Child Tax Credit and Credit for
Other Dependents, made permanent by the One Big Beautiful Bill Act starting
tax year 2025. Entirely client-side; nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/child-tax-credit-calculator/

After using this, you can now **turn "how many kids, how much do I make" into
an estimated Child Tax Credit, Credit for Other Dependents, and a refundable
Additional Child Tax Credit ceiling in seconds, including the three things
people get wrong by hand: dependents without an SSN get a smaller, separate
credit instead of nothing; the phase-out rounds UP to the next $1,000; and
the refundable amount is a maximum, not a guaranteed refund** — arithmetic
that otherwise means reading Schedule 8812's instructions and hoping the
rounding and the CTC/ODC split were applied correctly.

## Why this exists

This credit's headline $2,200 figure is widely known, but the surrounding
mechanics are not, verified via WebSearch on 2026-09-25 against the IRS's
own newsroom release on 2026 inflation adjustments, Kiplinger, Jackson
Hewitt, the Tax Policy Center, Congress.gov's CRS product on taxpayer ID
requirements, and several independent CPA/payroll-firm summaries,
cross-checked against each other:

- **Dependents without an SSN are not simply excluded** — a child with only
  an ITIN, or a dependent who turned 17 during the year, still qualifies for
  the separate $500 Credit for Other Dependents (ODC), which is entirely
  nonrefundable, unlike the CTC's refundable portion.
- **The filer needs a valid SSN too**, an OBBBA change: the taxpayer (and,
  on a joint return, at least one spouse) must have a Social Security number
  valid for employment to claim either credit — even if every dependent has
  one.
- **The phase-out rounds UP** to the next $1,000 of MAGI over the threshold,
  at $50 per $1,000 — so $1 over the line costs the same full $50 as $999
  over it, the statute's own "or fraction thereof" language.
- **The refundable Additional Child Tax Credit is a ceiling, not a
  guarantee.** It caps at the smallest of $1,700 per qualifying child, 15%
  of earned income over $2,500, and the CTC remaining after phase-out — but
  the actual refund also depends on how much of the credit was needed to
  offset tax liability first, which this tool does not model.
- **Permanent, unlike this portfolio's own temporary OBBBA calculators** —
  no scheduled expiration year.

## Try it

Open [`index.html`](index.html). Enter filing status, estimated MAGI,
earned income, and check the filer-SSN box; enter your qualifying children
and other dependents. Click **Calculate**.

## What it calculates

All in [`calc.mjs`](calc.mjs), as pure functions with no dependencies:

- **`computeChildTaxCredit`** — applies the $2,200 CTC and $500 ODC amounts,
  the combined phase-out, the filer-SSN requirement, and the refundable
  ACTC ceiling. Any disqualifying condition (no filer SSN, no dependents)
  zeroes the result and names itself in the findings.
- **`phaseOutReduction`** — the stepped $50-per-$1,000-or-part-thereof
  reduction, rounding up.
- The phase-out reduction is applied to the ODC pool first, then any
  leftover spills into the CTC pool — an identity, not an approximation:
  since the reduction is a flat number independent of pool composition,
  this always reproduces the IRS's own "Credit Limit Worksheet B" residual
  split that isolates how much of the surviving credit is CTC-eligible for
  the ACTC refund. See the header comment in `calc.mjs` for the full
  derivation.

## What this does not cover

- Not a full tax return — no other deductions, credits, or state tax.
- The refundable ACTC figure is a ceiling: it does not model total tax
  liability, so it cannot say how much of the CTC is used nonrefundably
  first before any of it becomes refundable.
- Ages, SSNs, ITINs, and dependent relationships are self-reported by the
  user, not verified against any external source.
- Federal only. Most states offer their own, separate child tax credit or
  none at all.

## Disclaimers

Not legal, tax, or financial advice. This applies the published statutory
amounts, phase-out formula, and eligibility rules to the numbers and
checkboxes you enter; it is not a substitute for reviewing IRS guidance or
consulting a qualified tax professional before filing.

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
