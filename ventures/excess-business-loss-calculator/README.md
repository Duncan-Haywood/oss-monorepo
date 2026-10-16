# Excess Business Loss Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/excess-business-loss-calculator/>

A free browser calculator for the IRC Section 461(l) excess business loss
limitation, made permanent by the One Big Beautiful Bill Act. Entirely
client-side; nothing is uploaded.

After using this, you can now **see how much of your net business loss is
deductible this year against the 2025/2026 threshold, and how much becomes
a net operating loss carryforward** — including the counterintuitive fact
that the 2026 threshold is lower than 2025's, not higher.

## Why this exists

The excess business loss limitation was scheduled to expire after 2028;
the One Big Beautiful Bill Act (OBBBA, signed July 4, 2025) made it
permanent. Verified via WebSearch on 2026-09-25 against Moss Adams'
"Avoid Tax Surprises Related to Excess Business Loss Limitations
Post-OBBBA", Baker Tilly's year-end planning guide, Hiltzik CPA's "Excess
Business Loss Limitation 2026: Threshold Falls to $256,000", Keiter's
"Excess Business Loss | OBBBA", MBE CPAs' 2026 guide, and a cross-check
search against Tax Notes' threshold reference table:

- **The threshold is $313,000 (single/HOH/MFS) / $626,000 (MFJ) for 2025**
  — married filing jointly is exactly double the other three statuses'
  shared figure.
- **The 2026 threshold is LOWER, not higher** — $256,000 / $512,000 — because
  OBBBA rebased how it is indexed for inflation, resetting it closer to its
  original 2017 base instead of continuing to compound. Most OBBBA changes
  raise a threshold; this one is a rare exception.
- **The excess above the threshold isn't lost** — it becomes a net
  operating loss (NOL) carryforward, usable against up to 80% of a future
  year's taxable income under current law.
- **Only trade-or-business income and deductions count** toward the net
  loss figure — wages, interest, dividends, and capital gains outside a
  business are what the *allowed* loss then offsets, not part of the loss
  itself.

## Try it

Open [`index.html`](index.html). Enter your filing status, tax year, and
total business income and deductions. Click **Calculate**.

## What it calculates

All in [`calc.mjs`](calc.mjs), as a pure function with no dependencies:

- **`excessBusinessLossOutcome`** — the net business loss, the amount
  deductible this year against the threshold, and the excess that becomes
  an NOL carryforward.

## What this does not cover

- Not a full tax return — no other deductions or credits, or state tax.
- Does not compute your net business loss from a Schedule C, K-1, or other
  source document — you supply the aggregate figures directly.
- No Section 199A QBI-deduction interaction modeling (see the
  [QBI deduction calculator](../qbi-deduction-calculator/)).
- No NOL carryforward valuation in a future year.

## Disclaimers

Not legal, tax, or financial advice. This applies the published federal
excess-business-loss threshold to the numbers you enter; it is not a
substitute for reviewing IRS guidance or consulting a qualified tax
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
