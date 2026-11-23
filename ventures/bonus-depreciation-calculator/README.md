# Bonus Depreciation vs. Section 179 Calculator

A free browser calculator comparing three ways to write off a new equipment
or asset purchase: 100% bonus depreciation, a Section 179 election, and plain
MACRS depreciation with no election. Entirely client-side; nothing is
uploaded.

**Live tool:** https://marisstella.app/bonus-depreciation-calculator/

After using this, you can now **see the current-year cash tax saving under
all three paths for the same purchase, with the 2025/2026 Section 179 dollar
limit and phase-out already applied, and know whether an over-large deduction
creates a net operating loss or a Section 179 carryforward** — which used to
take reading several CPA-firm explainers and doing the phase-out and
income-cap arithmetic by hand.

## Why this exists

The One Big Beautiful Bill Act (OBBBA, signed July 4, 2025) made 100% bonus
depreciation permanent for property acquired and placed in service after
January 19, 2025, and separately raised Section 179's limit and phase-out
threshold. Verified via WebSearch on 2026-09-25 against BDO's "One Big
Beautiful Bill Act Expands 100% Depreciation Expensing Opportunities", RSM
US's "The OBBBA restores and expands bonus depreciation", Grant Thornton's
"OBBBA offers new ways to accelerate depreciation", Section179.org's 2026
deduction guide and its "Section 179 vs Bonus Depreciation" comparison,
Instead's "Section 179 expensing limits for 2026", Thomson Reuters' "Who
needs Sec. 179 expensing when 100% bonus depreciation is available?", and
WCG's "Section 179 or Bonus Depreciation":

- **The two elections fail differently when a deduction is bigger than
  income.** Bonus depreciation (and plain MACRS) can create or increase a net
  operating loss (NOL), which carries forward and can offset up to 80% of a
  future year's taxable income. Section 179 cannot create a loss at all — the
  unusable amount carries forward as a SECTION 179 deduction, still
  income-limited every future year. Confusing the two overstates how much of
  either benefit is locked in immediately.
- **Section 179's phase-out counts every qualifying purchase for the year,
  not just the one being considered** — $2,500,000 limit / $4,000,000
  phase-out threshold for 2025, $2,560,000 / $4,090,000 for 2026 (both
  inflation-adjusted going forward). Bonus depreciation has no such cap or
  phase-out.
- **Bonus depreciation is all-or-nothing for an entire property class;
  Section 179 is elected dollar-by-dollar, asset-by-asset.** A business
  expecting a loss year sometimes prefers a smaller, income-capped Section
  179 election, or electing out of bonus depreciation entirely, to avoid
  creating a large NOL and instead preserve depreciation for a future,
  higher-income year.
- **Section 179 needs more than 50% business use** (IRS Pub. 946, ch. 2).
  For listed property such as a passenger vehicle, 50% or less business use
  also rules out bonus depreciation and requires the slower, straight-line
  Alternative Depreciation System (ADS) (IRC 280F(b)(1)); other property
  keeps bonus depreciation on its business-use share. At 50% or less the
  calculator's Section 179 column elects nothing (no election, no
  carryforward) and shows bonus depreciation on the whole basis.

## Try it

Open [`index.html`](index.html). Enter the asset cost, business-use
percentage, recovery period, tax year, any other Section 179-eligible
purchases this year, taxable income before this deduction, and your tax
rate. Click **Calculate**.

## What it calculates

All in [`calc.mjs`](calc.mjs), as pure functions with no dependencies:

- **`compareDepreciationPaths`** — runs bonus depreciation, a Section 179
  election, and plain MACRS on the same purchase: eligible basis, each
  path's usable deduction and cash tax saving this year, the Section 179
  phase-out and carryforward, and the MACRS remaining basis. When the basis
  is larger than the Section 179 limit, the Section 179 column takes 100%
  bonus on the remainder in the same year, as a preparer would (Pub. 946 ch. 3).
- **`section179Outcome`** — applies the year's dollar limit, the
  dollar-for-dollar phase-out against total qualifying purchases, and the
  income cap (producing a carryforward, never an NOL).
- **`usableDeduction`** — caps a requested deduction at the year's available
  taxable income and flags the excess as NOL-creating (used for both bonus
  depreciation and the MACRS baseline).

## What this does not cover

- Not a full tax return — no other deductions, credits, self-employment or
  payroll tax, AMT, or state tax (state conformity to bonus depreciation
  varies widely).
- No Alternative Depreciation System (ADS) modeling for the ≤50%-business-use
  case — flagged, not computed.
- No luxury-auto depreciation caps for passenger vehicles.
- No net operating loss or Section 179 carryforward valuation in a future
  year.

## Known gaps (quality census, 2026-11-17)

From [the census audit](../../portfolio/quality/audits/2026-11-17-bonus-depreciation-calculator.json),
not yet fixed:

- There is no acquisition-date input: 2025 property acquired before
  January 20, 2025 gets 40% bonus, not 100%.
- No mid-quarter convention warning; the MACRS rate test compares the output
  with the code's own table.

## Disclaimers

Not legal, tax, or financial advice. This applies published federal
bonus-depreciation, Section 179, and MACRS rules to the numbers you enter; it
is not a substitute for reviewing IRS guidance or consulting a qualified tax
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
