# No Tax on Tips & Overtime Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/no-tax-on-tips-overtime-calculator/>

A free browser calculator for two new federal deductions: the "no tax on
tips" qualified-tips deduction and the "no tax on overtime" qualified
overtime compensation deduction, both enacted by the One Big Beautiful Bill
Act for tax years 2025 through 2028. Entirely client-side; nothing is
uploaded.

After using this, you can now **turn qualified tips and overtime pay into an
estimated federal deduction and rough tax savings in seconds, including the
two steps a quick by-hand guess usually gets wrong: the overtime deduction
is only the half-time premium, not the full overtime rate, and the income
phase-out rounds up to the next $1,000, not down** — arithmetic that
otherwise means reading two IRS FAQ pages and doing it yourself.

## Why this exists

Both deductions are new for the 2025 tax year and are being widely searched
right now ("no tax on tips calculator", "no tax on overtime calculator") as
2025 W-2s land and 2026 withholding gets planned. Each has a genuinely
easy-to-miss mechanic:

- **Tips**: up to $25,000/year, only for occupations on Treasury's published
  list of those that customarily and regularly receive tips (final
  regulations published 2026-04-13, effective 2026-06-12).
- **Overtime**: up to $12,500/year (single/head of household) or $25,000
  (married filing jointly) — but only the FLSA **half-time premium**
  portion of overtime pay (the extra 0.5x for hours over 40 in a week), not
  the full time-and-a-half rate. Someone earning $30/hr overtime from a
  $20/hr base has $10/hr of qualified premium, not $30/hr — the same
  "premium vs. full rate" distinction this portfolio's
  [`overtime-pay-calculator`](../overtime-pay-calculator/) already applies
  for the FLSA blended-rate case, extended here to the tax side.
- **Both** phase out on the same schedule: reduced by $100 per $1,000 (or
  part of $1,000) of MAGI over $150,000 single/head-of-household or
  $300,000 joint — each deduction's own cap decides where it actually
  reaches zero (tips: $400k single / $550k joint; overtime: $275k single or
  head of household / $550k joint), figures cross-checked against several
  independent published sources during graduation.

## Try it

Open [`index.html`](index.html). Enter filing status, estimated MAGI, and a
marginal tax rate; enter qualified tips (and, if self-employed, net profit
from that tipped work); enter overtime premium directly if you already know
it (for example from a 2025+ W-2's Box 14 "FLSA OT Prem"), or add hourly
rate/overtime-hours/weeks rows to compute it. Click **Calculate**.

## What it calculates

All in [`calc.mjs`](calc.mjs), as pure functions with no dependencies:

- **`computeQualifiedTipDeduction`** — applies the $25,000 cap, the MAGI
  phase-out, and (when self-employed) the net-profit cap. Per Schedule
  1-A's instructions (clarified 2026-03, after an earlier draft read as net
  profit alone), the cap is net profit **minus** deductions allocable to
  that business — the deductible part of self-employment tax, plus any
  self-employed retirement-plan or health-insurance deduction claimed
  against it — each entered as its own optional field rather than derived
  here, since the filer already computes them elsewhere on the same return.
- **`computeQualifiedOvertimeDeduction`** — applies the $12,500/$25,000 cap
  and the same phase-out formula.
- **`phaseOutReduction`** — $100 per $1,000 of MAGI over the threshold,
  rounding the excess **up** to the next $1,000 ("or fraction thereof").
- **`computeOvertimePremiumRow`** / **`sumOvertimePremiumRows`** — the
  half-time-premium-only overtime figure from a rate, overtime hours, and
  weeks. For a week worked at two or more *different* rates (the FLSA
  weighted-average case), this deliberately does not restate that
  arithmetic — it points to `overtime-pay-calculator`'s already-tested
  blended-rate calculator instead.
- **`estimateTaxSavings`** — the combined deduction times a user-chosen
  marginal rate, clearly labelled as a rough estimate, not a full return.

## What this does not cover

- Not a full tax return — no other deductions, credits, self-employment tax,
  or state tax.
- Occupation eligibility for the tip deduction is self-reported by the user,
  not checked against Treasury's official list.
- Does not reduce FICA/SECA payroll tax, and most states still tax tips and
  overtime in full unless that state separately conforms.

## Disclaimers

Not legal, tax, or financial advice. This applies the published statutory
caps and phase-out formula to the numbers you enter; it is not a substitute
for reviewing IRS guidance or consulting a qualified tax professional before
filing.

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
