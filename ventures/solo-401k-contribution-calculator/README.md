# Solo 401(k) Contribution Calculator

A free browser calculator for the 2026 Solo 401(k) contribution limit for a
sole proprietor or single-member LLC. Entirely client-side; nothing is
uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/solo-401k-contribution-calculator/

After using this, you can now **see your maximum 2026 Solo 401(k)
contribution — employee elective deferral plus employer profit-sharing,
combined** — which used to mean working through IRS Publication 560's
worksheet by hand, including the circular 25%-of-earnings-after-the-
contribution step that trips up the arithmetic.

## Why this exists

Verified 2026-09-28 via WebSearch and WebFetch against IRS.gov's own
"Retirement Topics - 401(k) and Profit-Sharing Plan Contribution Limits"
page, Fidelity's "Solo 401(k) contribution limits 2025 and 2026", and the
Social Security Administration's own 2026 COLA fact sheet:

- **2026 employee elective deferral: $24,500** ($32,500 with the age-50
  catch-up, or $35,750 with the SECURE 2.0 enhanced catch-up for ages
  60-63 — which replaces, not adds to, the standard catch-up).
- **Employer profit-sharing contribution: 20% of net self-employment
  earnings** for a sole proprietor or single-member LLC (the
  sole-proprietor-equivalent of a plan's stated 25% rate, because the
  contribution is itself computed on earnings net of the contribution).
- **Combined overall limit (Section 415(c)): $72,000**, or $80,000 with
  the standard catch-up, or $83,250 with the enhanced 60-63 catch-up.
- **2026 Social Security wage base: $184,500** — caps the Social Security
  portion of self-employment tax, which is itself half-deductible and
  reduces net profit down to net self-employment earnings.

## Try it

Open [`index.html`](index.html). Enter your net profit and age, then click
**Calculate**. Optionally enter an elective deferral already made to a
separate W-2 job's 401(k) this year (the limit is shared across every plan,
not per plan), or a specific deferral amount instead of the maximum.

## What it calculates

All in [`calc.mjs`](calc.mjs), as pure functions with no dependencies:

- **`selfEmploymentTaxOutcome`** — self-employment tax on 92.35% of net
  profit (12.4% Social Security up to the 2026 wage base, 2.9% Medicare
  uncapped), and the above-the-line-deductible half of it.
- **`netSelfEmploymentEarnings`** — net profit minus half of
  self-employment tax, capped at the 2026 $360,000 compensation limit.
- **`catchUpFor`** — the elective-deferral catch-up for a given age: the
  enhanced 60-63 amount, the standard 50+ amount, or none.
- **`solo401kContributionOutcome`** — the full 2026 outcome: employee
  elective deferral (capped by the statutory limit, net earnings, and any
  deferral used elsewhere), employer profit-sharing contribution (20% of
  net earnings), and the combined total under the overall limit.

## What this does not cover

- Sole proprietor / single-member LLC only — an S-corp or partnership uses
  W-2 wages or a K-1 allocation instead, a different formula entirely.
- Not a Schedule SE substitute — ignores the additional 0.9% Medicare
  surtax and does not handle multiple businesses or controlled-group
  rules.
- Does not model Roth, after-tax, or mega-backdoor-style contribution
  splits — only the total contribution room.
- Point-in-time 2026 figures; the limits re-index annually.

## Disclaimers

Not legal, tax, or financial advice. This applies published 2026 IRS
figures to the numbers you enter; it is not a substitute for IRS
Publication 560 or a qualified tax professional.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) never
changes what this tool does.

## Privacy

Everything runs in your browser. The numbers you enter are **never
uploaded** — there is no server component at all. Anonymous feature events
(`limit_calculated`, `example_loaded`) are counted in `localStorage` only,
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
