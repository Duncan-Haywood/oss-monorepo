# SALT Cap Deduction Calculator

A free browser calculator for the new federal SALT (state and local tax)
deduction cap, raised by the One Big Beautiful Bill Act from a flat $10,000
to $40,000 for tax years 2025 through 2029. Entirely client-side; nothing is
uploaded.

After using this, you can now **find out exactly how much of your state and
local tax bill is deductible this year -- including the 30% income
phase-down almost no headline mentions -- and whether the extra deduction
even beats the standard deduction once you add it up**, in seconds, instead
of reading a dense CPA-firm explainer and hoping you applied the phase-down
and the standard-deduction comparison correctly.

## Why this exists

The SALT cap increase is one of the most-searched provisions of the One Big
Beautiful Bill Act, and for good reason: it affects millions of itemizing
homeowners in high-tax states directly, in dollar amounts that matter. But
two mechanics are genuinely easy to get wrong, both verified via WebSearch
on 2026-09-25 against Kiplinger, Venable LLP, Thomson Reuters Tax &
Accounting, the Bipartisan Policy Center, several independent CPA-firm
summaries, and the IRS's own tax-year-2026 inflation-adjustment release:

- **The cap phases DOWN, not out, and by 30% of excess MAGI** -- reduced by
  30 cents for every dollar of MAGI over $500,000 ($250,000 married filing
  separately) for 2025, never below a $10,000 floor. A taxpayer near
  $600,000 MAGI gets essentially none of the headline increase, and most
  coverage states the $40,000 figure without ever mentioning this.
- **A higher SALT deduction does not automatically mean lower taxes.** It
  only helps once your TOTAL itemized deductions exceed your standard
  deduction -- and for a filer whose other itemized deductions (mortgage
  interest, charitable giving) are modest, a meaningful chunk of the
  "increase" produces $0 of real benefit. This calculator is, as far as
  research for this venture found, the first free SALT cap calculator that
  computes this interaction explicitly rather than just showing the capped
  deduction amount in isolation.

## Try it

Open [`index.html`](index.html). Enter filing status, tax year, and
estimated MAGI; enter your state and local tax paid, other itemized
deductions, and your own standard deduction reference figure. Click
**Calculate**.

## What it calculates

All in [`calc.mjs`](calc.mjs), as pure functions with no dependencies:

- **`saltCapParameters`** -- the cap, phase-down threshold, and floor for a
  given tax year and filing status. Confirmed IRS figures for 2025-2026;
  2027-2029 are projected from the statute's own 1%/year indexing formula
  and marked `confirmed: false`; 2030+ reverts to the flat, pre-OBBBA
  $10,000 cap with no phase-down at all.
- **`computeSaltCapDeduction`** -- applies the cap, the 30%-of-excess
  phase-down, and the floor to the SALT actually paid, reporting the
  deduction, the disallowed amount, and plain-English findings.
- **`marginalItemizedBenefit`** -- the itemize-vs-standard-deduction
  interaction: how much of the SALT deduction is genuinely additive tax
  benefit versus duplicating what the standard deduction already provides.

## What this does not cover

- Not a full tax return -- no other deductions, credits, or Alternative
  Minimum Tax (AMT) interaction.
- Federal only. Whether and how much a specific state's own return allows
  is a separate question this tool does not answer.
- Does not model pass-through entity tax (PTET) workarounds, which many
  states offer separately to business owners on the business's own return.
- 2027-2029 figures are this calculator's own projection, not an official
  IRS number -- the page says so explicitly.

## Disclaimers

Not legal, tax, or financial advice. This applies the published statutory
cap, phase-down formula, and floor to the numbers you enter; it is not a
substitute for reviewing IRS guidance or consulting a qualified tax
professional before filing.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) never
changes what this tool does.

## Privacy

Everything runs in your browser. The numbers you enter are **never
uploaded** -- there is no server component at all. Anonymous feature events
(`estimate_calculated`, `example_loaded`) are counted in `localStorage`
only, never transmitted. Do Not Track and Global Privacy Control are
honoured, and a button on the page turns counting off entirely.

## Development

```sh
node --test
```

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). The calculator and its
test suite are done; no external user contact has happened yet -- see
`kill_criteria` in `VENTURE.yaml`.
