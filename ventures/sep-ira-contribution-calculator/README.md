# SEP-IRA Contribution Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/sep-ira-contribution-calculator/>

A free browser calculator for the 2026 SEP-IRA contribution limit for a sole
proprietor or single-member LLC. Entirely client-side; nothing is uploaded.

After using this, you can now **see your maximum 2026 SEP-IRA contribution
and how it compares with a Solo 401(k)** — which used to mean working
through IRS Publication 560's rate table and self-employment-tax worksheet
by hand.

## Why this exists

Verified 2026-09-28 (Fidelity, ADP and Accuplan 2026 limit pages, plus the
IRS/SSA figures the sibling `solo-401k-contribution-calculator` checked
against IRS.gov and the SSA 2026 COLA sheet):

- **2026 SEP-IRA limit: the lesser of 25% of compensation or $72,000.**
- For a self-employed owner 25% is an **effective 20% of net
  self-employment earnings** (25% / 1.25), where net earnings are net
  profit minus half of self-employment tax, capped at the $360,000
  compensation limit.
- **2026 Social Security wage base: $184,500.**
- A SEP-IRA has no employee deferral and no age catch-up; the Solo 401(k)
  adds both, so on the same earnings it usually allows more.

## Try it

Open [`index.html`](index.html). Enter your net profit and click
**Calculate**. Optionally enter the contribution you plan to make to see
whether it fits.

## What it calculates

All in [`calc.mjs`](calc.mjs), pure functions, no dependencies:

- **`selfEmploymentTaxOutcome`** — SE tax on 92.35% of net profit and its
  deductible half.
- **`netSelfEmploymentEarnings`** — net profit minus that half, capped at
  $360,000.
- **`sepIraContributionOutcome`** — the 20% contribution, the $72,000 cap,
  a trimmed planned amount, and the Solo 401(k) comparison figure.

## What this does not cover

- Sole proprietor / single-member LLC only; S-corps and partnerships use a
  different formula.
- Eligible employees must receive the same percentage; not modelled.
- Not a Schedule SE substitute (no 0.9% Medicare surtax).
- Point-in-time 2026 figures; limits re-index annually.

## Disclaimers

Not legal, tax, or financial advice. This applies published 2026 IRS
figures to the numbers you enter; it is not a substitute for IRS
Publication 560 or a qualified tax professional.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) never
changes what this tool does.

## Privacy

Everything runs in your browser. Numbers are **never uploaded**. Anonymous
feature events (`limit_calculated`, `example_loaded`) are counted in
`localStorage` only. Do Not Track and Global Privacy Control are honoured,
and a button on the page turns counting off.

## Development

```sh
node --test
```

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml); see `kill_criteria`.
