# Exempt Salary Threshold Checker

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/exempt-salary-threshold-checker/>

A free browser calculator for the 2026 FLSA white-collar overtime-exemption
salary threshold. Entirely client-side; nothing is uploaded.

After using this, you can now **see whether a weekly salary clears the
applicable federal or state overtime-exemption threshold, and by how much
it falls short if not** — which used to take reading a payroll-compliance
blog post and cross-referencing your own state's figure by hand.

## Why this exists

Verified via WebSearch on 2026-09-25 against natlawreview.com's "New York
State Minimum Wage and Exempt Salary Updates for 2026", Proskauer Rose's
article of the same title, Symmetry's "2026 Exempt Salary Thresholds by
State", Nextep's "2026 Salary Threshold Increases", ADP's "Minimum Salary
Requirements for Overtime Exemption in 2026", and the Department of Labor's
May 15, 2026 Federal Register technical amendment:

- **The federal FLSA threshold is $684/week ($35,568/year)** for the
  executive, administrative, and professional (EAP) exemptions. The 2024
  rule that would have raised this to $1,128/week was vacated by a federal
  court; DOL's 2026 technical amendment confirmed $684 rather than raising
  it.
- **Five states set a higher figure that controls instead**, all effective
  2026: California ($1,352/week), Washington ($1,541.70/week), Maine
  ($871.16/week), New York (two regional figures), and Alaska ($1,120/week
  — but not effective until 2026-07-01, unlike the other four).
- **New York's higher figures apply only to the executive and
  administrative exemptions.** New York sets no state-specific threshold
  for the professional exemption, so the federal $684/week figure governs
  a professional-exemption classification even in New York — every other
  modeled state applies its higher figure across all three EAP categories.
- **The salary threshold is necessary, not sufficient.** An employee must
  also be paid on a true salary basis and must actually perform exempt
  duties under the applicable duties test — neither is modeled here.

## Try it

Open [`index.html`](index.html). Choose a state (or federal-only) and an
exemption category, enter the weekly salary, and click **Check**.

## What it calculates

All in [`calc.mjs`](calc.mjs), as pure functions with no dependencies:

- **`exemptionOutcome`** — resolves the applicable federal-or-state
  threshold for a jurisdiction and exemption category, compares it to the
  entered salary, and reports the shortfall if any.
- **`weeklyToAnnual` / `annualToWeekly`** — a 52-week conversion, for
  convenience.

## What this does not cover

- Not a full exemption determination — no salary-basis test, no duties
  test.
- No federal or state computer-employee exemption modeling.
- Five states only; other states may set their own thresholds this tool
  does not track.
- Point-in-time 2026 figures; Alaska's does not take effect until
  2026-07-01, and any state's figure can change again in a future year.

## Disclaimers

Not legal, tax, or financial advice. This applies published federal and
state salary-threshold figures to the numbers you enter; it is not a
substitute for reviewing current DOL and state guidance or consulting a
qualified employment attorney or HR compliance professional.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) never
changes what this tool does.

## Privacy

Everything runs in your browser. The numbers you enter are **never
uploaded** — there is no server component at all. Anonymous feature events
(`threshold_checked`, `example_loaded`) are counted in `localStorage` only,
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
