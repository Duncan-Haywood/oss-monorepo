---
title: "Two changes that only work together"
seo_title: "Choosing a staffing forecast window from your own sales: a backtest on three bakeries"
date: 2026-11-11
tags: [scheduling, forecasting, labor, small-business, open-source]
description: "Adding a 4-week window to the shift planner's auto weighting did nothing. Picking with a better score did nothing. Both together cut the misses on one bakery by up to 17 person-hours a week."
---

The free [shift roster builder](https://marisstella.app/shift-roster-builder/shifts-from-sales.html)
can plan shifts from a till export. By default it picks how much to favour
recent weeks from the shop's own history. It backtests a few weightings on the
file: every past week weighed the same, or a half-life of 8, 4 or 2 weeks. Then
it keeps the one that left the fewest person-hours short or spare.

Earlier today a [scoring fix](2026-11-11-shift-roster-the-score-could-not-see-a-locked-door.md)
showed something on one of the three real bakery files we test on. On the
"Bread Basket" file (20 tested weeks), a plan built from only the last 4 weeks
beat the plain average at every setting. That shop stopped opening its evening
hours during the file. At 18:00 it traded on 12 of 30 November dates and 2 of 31
March ones. A long memory keeps staffing those hours. So the obvious next step
was to offer "last 4 weeks" to the automatic picker.

## Two changes, tried one at a time and together

We ran it out of sample, the way the picker would run for a real shop. At each
week, it used whichever option had done best on the weeks before it. We tried
four versions of the rule on 18 settings (3 files, 3 staffing rates, minimum
staff 1 or 2), each against the rule that shipped before:

| Rule | clearly better | tie | clearly worse | mean |
|---|---|---|---|---|
| same options, picked with the new score | 0 | 18 | 0 | +0.0% |
| adds "last 4 weeks", picked with the old score | 0 | 17 | 1 | +0.5% |
| **adds "last 4 weeks", picked with the new score** | **6** | 12 | **0** | **-16.3%** |

Neither change does anything alone. The old score counted minimum staff as
needed in every hour the plan staffed. So it charged the 4-week plan as short
for *not* staffing evenings the shop no longer opened, and the picker never
chose it. The new score counts staff in a normally shut hour as spare. Without
the window, though, it has nothing better to choose than the half-lives the old
picker already chose.

Together, all six Bread Basket settings were clearly better: 5.8 to 16.7 fewer
person-hours short or spare a week. The picker took the 4-week plan in 16 of
the 20 weeks. On the French bakery (87 weeks) and the Korean one (38 weeks)
every setting was a tie, within half a person-hour either way.

## What shipped

`--half-life auto` (the default for `--from-sales`, and `auto` on the page) now
also tries the last 4 weeks, and it picks with the closure-aware score. A new
`--last-weeks <n>` flag plans from a fixed window. The script and its full
output are in the repository (`eval/window-auto.mjs`).

The limits are real. One bakery carries the whole gain. The other two show the
change costs nothing, not that it helps. Weeks are not independent, so the
intervals are a little narrow. A fourth real sales file is the next thing that
would change our mind.

*The roster builder gives planning estimates from your own numbers. It is not
legal, labour-law or financial advice.*
