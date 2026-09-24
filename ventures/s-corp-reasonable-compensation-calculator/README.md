# S-Corp Reasonable Compensation Calculator

A free browser calculator for an S-corp owner-employee's reasonable-
compensation salary range: the cost approach (duties actually performed),
the market approach (what an outside hire would cost), and the income
approach / independent-investor test (net profit minus a fair return on
invested capital) — plus the FICA/SECA payroll-tax delta between the low
and high ends of the resulting range. Entirely client-side; nothing is
uploaded.

After using this, you can now **turn a description of what you actually do
in your S-corp, your business's profit, and your invested capital into a
documented, three-methodology salary range — and see exactly what each
point of that range costs in payroll tax — which used to mean a $100-1,200
CPA "reasonable compensation" report or hours of your own BLS wage-data
research.**

## Why this exists

An S-corp owner-employee must be paid reasonable W-2 compensation for
services performed before any remaining profit is taken as a distribution
— only the wage portion pays FICA payroll tax. Set the salary too low and
the IRS can recharacterize distributions as wages, with back payroll tax,
interest, and a penalty; set it too high and the owner pays payroll tax for
no reason. Unlike most of this portfolio's tax calculators, this decision
**recurs every year** the S-corp election is in effect.

Distribution evidence: WebSearch found a live, commercially validated
market for exactly this calculator — RCReports sells this analysis for
$100-400/report to preparers (who charge clients $400-1,200), ReasonableCompCalc
sells the same category starting at $199, and at least five CPA firms
(madsencpa.com, taxstra.com, sdocpa.com, slpwealth.com,
evergreensmallbusiness.com) each publish their own free version as a lead-
generation tool competing for the identical search phrase. Full write-up:
[`portfolio/pipeline/candidates/s-corp-reasonable-compensation-calculator.md`](../../portfolio/pipeline/candidates/s-corp-reasonable-compensation-calculator.md).

## Try it

Open [`index.html`](index.html). Enter net business profit before your
compensation, invested capital, and a fair return rate; list up to three
duties and the share of your time each takes; pick a tax year and filing
status. Click **Calculate my range**.

## What it calculates

All in [`calc.mjs`](calc.mjs), as pure functions with no dependencies:

- **`costApproach`** — sum of each duty's reference wage, weighted by time
  and scaled to hours worked relative to a 40-hour week.
- **`marketApproach`** — the primary role's reference wage, hours-scaled.
- **`incomeApproach`** — net profit before compensation, minus a fair
  return on invested capital; never negative.
- **`estimateReasonableCompensation`** — the full estimate: cost and market
  set an initial low-high span, and the income approach can only ever pull
  that span *down* (never up) when it would leave too little return for an
  outside investor — never averaged into a single figure.
- **`payrollTaxOnWage`** — combined employee + employer FICA on a wage: the
  2025/2026 Social Security wage base, uncapped 2.9% Medicare, and the 0.9%
  Additional Medicare Tax above the filing-status threshold.

## What this does not cover

- **Not a determination.** A documented range from a stated methodology,
  never a single asserted "correct" salary — the IRS itself applies no
  single formula.
- **Reference wages, not a live feed.** The occupational wage table is an
  approximate, rounded reference (BLS OEWS-range figures) — verify against
  BLS's own current data for your metro area before treating a figure here
  as final.
- **One tax year of payroll tax only** — not full tax liability, state
  payroll tax, unemployment insurance, or income tax (which applies to
  wages and distributions alike, so it does not change this decision).
- **Single owner-employee** — no multi-shareholder allocation.

## Disclaimers

Not legal, tax, or financial advice. This produces an estimate range from a
published methodology and a reference wage table; it does not touch payroll
or filing and is not a substitute for a qualified CPA or tax attorney
reviewing your specific facts.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) never
changes what this tool does.

## Privacy

Everything runs in your browser. The numbers you enter are **never
uploaded** — there is no server component at all. Anonymous feature events
(`range_calculated`, `example_loaded`) are counted in `localStorage` only,
never transmitted. Do Not Track and Global Privacy Control are honoured,
and a button on the page turns counting off entirely.

## Development

```sh
node --test
```

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). The calculator and its
test suite are done; no external user contact has happened yet — see
`kill_criteria` in `VENTURE.yaml`.
