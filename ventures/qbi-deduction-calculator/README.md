# QBI Deduction Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/qbi-deduction-calculator/>

A free browser calculator for the Section 199A qualified business income
(QBI) deduction: the 20% deduction, the taxable-income threshold and
phase-in range for 2025 and 2026 (including the OBBBA-widened 2026 range and
new $400 minimum deduction), the specified-service-business (SSTB)
phase-out, and the W-2 wage / UBIA-of-qualified-property limitation.
Entirely client-side; nothing is uploaded.

After using this, you can now **turn taxable income, one qualified trade or
business's QBI, W-2 wages, and UBIA into an estimated deduction and rough
tax savings in seconds, including the two steps a quick by-hand pass at the
Form 8995-A worksheet usually gets wrong: an SSTB scales QBI, wages, AND
UBIA together by the applicable percentage before the wage/UBIA test runs,
and the overall taxable-income cap is a second, independent limit** —
arithmetic that otherwise means working through the IRS's own worksheet
by hand.

## Why this exists

The QBI deduction has been permanent tax-planning arithmetic since 2018, and
the One Big Beautiful Bill Act (OBBBA) changed it again for tax year 2026:
the deduction itself was made permanent, the phase-in range widened from
$50,000/$100,000 to $75,000/$150,000, and a new $400 minimum deduction
applies whenever QBI from an active qualified trade or business is at least
$1,000. Two mechanics inside the formula are the ones a hand estimate most
often gets wrong:

- **The SSTB phase-out scales three numbers together, not one.** Inside the
  phase-in range, a specified service trade or business must reduce QBI,
  W-2 wages, *and* UBIA by the same "applicable percentage" before the 20%
  and wage/UBIA calculations run on the reduced figures — not just cap the
  final result.
- **The overall cap is independent of the QBI-based limit.** The deduction
  is the *lesser* of the QBI-based amount and 20% of (taxable income minus
  net capital gain) — a return with large itemized deductions or a big
  capital loss can hit this second cap well before the QBI formula's own
  limits would bind.

## Try it

Open [`index.html`](index.html). Pick the tax year and filing status, enter
taxable income before this deduction and net capital gain, enter your
business's QBI (mark it as a specified service business if it is one), W-2
wages and UBIA, and any REIT dividend / PTP income. Click **Calculate**.

## What it calculates

All in [`calc.mjs`](calc.mjs), as pure functions with no dependencies:

- **`computeBusinessComponent`** — one business's QBI component: the
  unreduced 20% below threshold, the SSTB applicable-percentage reduction
  and/or the W-2 wage / UBIA limit inside and above the phase-in range.
- **`computeQbiDeduction`** — the full estimate: the business component,
  plus 20% of REIT dividends / PTP income (never wage-limited or
  SSTB-reduced), the 2026+ $400 minimum-deduction floor, and the overall
  20%-of-(taxable income minus net capital gain) cap.
- **`thresholdFor`** — the taxable-income threshold and phase-in range for a
  tax year and filing status, read from a table rather than recomputed
  inline.
- **`estimateTaxSavings`** — the deduction times a user-chosen marginal
  rate, clearly labelled as a rough estimate, not a full return.

## What this does not cover

- **One qualified trade or business only.** Combining QBI, W-2 wages, and
  UBIA across more than one business — including the regulation's
  requirement to net a loss from one business against QBI from another
  before applying the wage/UBIA limit — is not modeled.
- Not a full tax return — no self-employment tax, other deductions or
  credits, or state tax (most states either do not conform to this
  deduction or apply their own rules).
- SSTB classification is self-reported by the user, not checked against the
  statute and Treas. Reg. 1.199A-5.
- The 2026+ $400 minimum deduction is modeled as a floor applied before the
  overall taxable-income cap, a simplification for an edge case published
  guidance does not fully spell out yet.

## Disclaimers

Not legal, tax, or financial advice. This applies the published statutory
formula for one qualified trade or business to the numbers you enter; it is
not a substitute for reviewing IRS Form 8995-A instructions or consulting a
qualified tax professional before filing.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) never
changes what this tool does.

## Privacy

Everything runs in your browser. The numbers you enter are **never
uploaded** — there is no server component at all. Anonymous feature events
(`deduction_calculated`, `example_loaded`) are counted in `localStorage`
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
