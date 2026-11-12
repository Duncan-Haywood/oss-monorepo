---
title: "Unit 1 is not in the unit column: twelve seeded faults in a new synthetic control tool"
seo_title: "Synthetic control tool: numeric unit ids now work, and five new tests"
date: 2026-11-12
tags: [testing, mutation-testing, synthetic-control, causal-inference, redteam]
description: "Twelve faults seeded into the synthetic control engine, four caught. A manual hunt found that numeric unit ids made the treated unit disappear."
---

The [synthetic control tool](../../ventures/synthetic-control/) landed on
`main` today. It estimates what an intervention did to one unit (a state, a
country, a store) by building a weighted average of untreated units that
tracks it beforehand, then reading the effect as the gap afterwards. Its
weights match pysyncon and R's Synth on the West German reunification panel
from Abadie, Diamond and Hainmueller (2015). Today's red-team run seeded
twelve faults into its engine (`redteam.py campaign`: change one constant,
flip one comparison, run the tests, put the file back).

| File | Seeded | Caught before | Equivalent | Caught after the new tests |
|---|---|---|---|---|
| `synthetic-control/engine.mjs` | 12 | 4 | 3 | 9 of 9 |

The tests pinned the hard parts well: the inner quadratic program is checked
against brute-force enumeration on 200 random problems, and the published
weights are reproduced. The faults that got through sat in the plumbing around
that core.

## What got through

- **The last post-period year.** Changing `time <= to` to `time < to` in the
  RMSPE helper dropped the final year from the post-period fit error, and with
  it the post/pre ratio that the placebo p-value ranks. The new test recomputes
  both RMSPEs from the reported gap series.
- **A reported loss that could be infinite.** `result.lossW`, the weighted
  predictor misfit, could divide instead of multiply and nobody noticed. On an
  exact convex combination it should be zero. Under the mutant it is infinite.
- **The middle lag.** With covariates, the default spec uses the outcome at
  the first, middle and last pre-period. Picking a third of the way along
  instead of the middle passed every test.
- **A note telling users something false.** Flip one `===` and every
  non-cross-validated run says "Cross-validation needs at least four
  pre-periods". A test now checks the note appears only when cv was asked for
  and could not run.
- **A Nelder-Mead that never stops early.** With `+` in place of `-` in the
  simplex-size check, the outer search runs to its evaluation cap every time.
  The answer barely changes, but the run is four times slower. The new test
  minimises a simple bowl and asserts it finishes in under half the cap.

Three mutants could not change anything a user sees: a loop that reads one
element past the end (`undefined > 0` is false), one extra pass past an
iteration cap the method never reaches, and the scale of a fallback starting
point that a strictly convex problem forgets (200 random problems gave
identical weights).

## What the hunt found

The engine takes either a CSV or an array of `records`. CSV cells are always
text, but records can carry numbers, and panels often number their units:

```js
analyze({ records, unit: "id", time: "t", outcome: "y", treated: 1, treatmentTime: 4 })
// Error: Treated unit "1" is not in the id column.
```

The panel kept the raw number `1` as the unit key while the treated id was
turned into the string `"1"`, so `includes` never matched. Unit ids are now
stored as text, so `treated: 1` and `donors: [2, 3]` work.

A second, smaller one: a monthly panel with dates like `2020-01` in the time
column dropped every row without a word, and the error that followed blamed
the treated unit. The tool needs a number per period. It now says that,
naming the time column.

Both have failing tests first, then the fix. The engine file went from 15 to
22 tests, and the whole venture suite (44 tests) still runs in about a second.
