# Auto Loan Interest Deduction Calculator

A free browser calculator for the new federal "qualified passenger vehicle
loan interest" (QPVLI) deduction, enacted by the One Big Beautiful Bill Act
for tax years 2025 through 2028. Entirely client-side; nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/auto-loan-interest-deduction-calculator/

After using this, you can now **turn a new car loan's interest into an
estimated federal deduction and rough tax savings in seconds, including the
two assumptions people get backwards: the $10,000 cap does not double for a
joint return, and married filing separately is NOT excluded the way it is
for the separate tips/overtime deduction** — arithmetic and eligibility
rules that otherwise mean reading a dense CPA-firm explainer and hoping you
applied all eight conditions correctly.

## Why this exists

This deduction is new for the 2025 tax year and is being widely searched
right now ("auto loan interest deduction calculator", "is my car loan
interest tax deductible 2026", "no tax on car loans") as buyers plan 2026
purchases and 2025 filers discover the deduction for the first time. It has
two genuinely easy-to-miss mechanics, both verified via WebSearch on
2026-09-24 against RSM, H&R Block, Thomson Reuters Tax & Accounting, the
Federal Register's own proposed-regulations notice (2026-01-02), Drake
Software's practitioner knowledge base, and several independent CPA-firm
summaries:

- **The cap does not double for joint filers.** A married couple filing
  jointly shares one $10,000 limit, not $10,000 each — unlike some other new
  deductions, and an assumption several summary articles gloss over.
- **Married filing separately IS eligible** — unlike this portfolio's own
  [`no-tax-on-tips-overtime-calculator`](../no-tax-on-tips-overtime-calculator/),
  which excludes MFS entirely. Each MFS spouse gets an independent $10,000
  cap on their own return, phased out using the same $100,000-$150,000
  thresholds a single filer uses. Anyone who used the tips/overtime
  calculator first and generalizes "MFS doesn't qualify" would get this
  deduction wrong in exactly the opposite direction.
- **Eligibility is an 8-item checklist**, not a single yes/no: new (not
  used), US final assembly, personal use, first-lien-secured loan, a loan
  (not a lease), no salvage/parts title, vehicle type and GVWR under 14,000
  lbs (RVs/campers excluded even as a primary residence), and debt incurred
  after 2024-12-31. Failing any one zeroes the whole deduction.

## Try it

Open [`index.html`](index.html). Enter filing status, estimated MAGI, and a
marginal tax rate; enter the interest paid this year; confirm each item on
the eligibility checklist. Click **Calculate**.

## What it calculates

All in [`calc.mjs`](calc.mjs), as pure functions with no dependencies:

- **`computeQualifiedVehicleInterestDeduction`** — applies the $10,000 cap,
  the MAGI phase-out, and the full 8-item eligibility checklist. Any unmet
  criterion zeroes the deduction and names itself in the findings, rather
  than silently returning $0.
- **`phaseOutReduction`** — $200 per $1,000 of MAGI over the threshold,
  rounding the excess **up** to the next $1,000 ("or fraction thereof").
- **`estimateTaxSavings`** — the deduction times a user-chosen marginal
  rate, clearly labelled as a rough estimate, not a full return.

## What this does not cover

- Not a full tax return — no other deductions, credits, or state tax.
- Final assembly location, lien status, and vehicle classification are
  self-reported by the user, not verified against NHTSA's VIN decoder or any
  other source here.
- Does not model refinanced loans, which have their own, separate rules.
- Does not reduce payroll tax, and most states still tax the same income
  unless that state separately conforms.

## Disclaimers

Not legal, tax, or financial advice. This applies the published statutory
cap, phase-out formula, and eligibility rules to the numbers and checkboxes
you enter; it is not a substitute for reviewing IRS guidance or consulting a
qualified tax professional before filing.

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
