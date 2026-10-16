# QSBS Exclusion Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/qsbs-exclusion-calculator/>

A free browser calculator for the Section 1202 Qualified Small Business
Stock (QSBS) gain exclusion, expanded by the One Big Beautiful Bill Act.
Entirely client-side; nothing is uploaded.

After using this, you can now **see your excluded and taxable gain under
the old all-or-nothing rule or the new tiered rule**, whichever applies to
your stock's acquisition date — which used to take reading a law-firm
alert and doing the cap-then-percentage arithmetic by hand.

## Why this exists

The One Big Beautiful Bill Act (OBBBA, signed July 4, 2025) expanded
Section 1202 for stock acquired after that date. Verified via WebSearch on
2026-09-25 against Kutak Rock's "Changes to IRC Section 1202 Under the One
Big Beautiful Bill Act", Baker Tilly's "Evaluating section 1202 benefits
after OBBBA" and its section 1202 changes summary, The Tax Adviser's "QSBS
gets a makeover" and "Revisiting Sec. 1202", K&L Gates' amendments summary,
Grant Thornton's benefits explainer, and a cross-check search confirming
the pre-OBBBA five-year cliff had no partial exclusion:

- **Stock acquired on or before July 4, 2025** keeps the old all-or-nothing
  rule for its entire life: 100% exclusion at more than 5 years held, 0%
  before that — no 3- or 4-year partial exclusion existed under the old
  rule at all. Eligible gain is capped at the greater of $10,000,000 or 10
  times basis.
- **Stock acquired after July 4, 2025** gets a tiered schedule instead —
  50% at 3 years, 75% at 4 years, 100% at 5 years — with a higher cap: the
  greater of $15,000,000 or 10 times basis.
- **The cap applies to eligible gain first**, then the holding-period
  percentage applies to that capped figure — not to the full, uncapped
  gain.
- **The cap is cumulative per issuer**, across every sale of that
  company's stock, not a fresh allowance each time.

## Try it

Open [`index.html`](index.html). Select which rule applies (by acquisition
date), enter years held, total gain, and your basis. Click **Calculate**.

## What it calculates

All in [`calc.mjs`](calc.mjs), as pure functions with no dependencies:

- **`qsbsExclusionOutcome`** — the exclusion cap, eligible gain, exclusion
  percentage, and the resulting excluded/taxable gain.
- **`exclusionPercent`** — the holding-period percentage for either rule.

## What this does not cover

- Not a full tax return — no other deductions, credits, AMT, or state tax
  (state conformity to Section 1202 varies).
- Does not verify QSBS eligibility — original issuance, C-corp status,
  active-business requirements, and the gross-assets threshold at issuance
  are company-level facts this tool does not check.
- No cumulative-cap tracking across multiple sales of the same issuer's
  stock.
- No day-precision holding-period timing near a milestone.

## Disclaimers

Not legal, tax, or financial advice. This applies published federal
Section 1202 rules to the numbers you enter; it is not a substitute for
reviewing IRS guidance or consulting a qualified tax professional.

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
