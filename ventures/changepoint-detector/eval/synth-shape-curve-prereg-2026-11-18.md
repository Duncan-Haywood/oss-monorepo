# Pre-registration: a curvature word to tell a donor's slope from a compounding gap (2026-11-18)

Written after one exploratory run (`eval/synth-shape-curve-explore.out.txt`, seed base 95000, 100 panels a cell, a
base no earlier shape run used) and committed before the confirmatory run (fresh seed base **97000**, 400 panels a
cell, `eval/synth-shape-curve-confirm.out.txt`).

## Why

README "The panel word scored where it switches on": on growing panels where `--shape-word panel` is in force, the
panel word calls a donor's own big slope 'held' 90% of the time, and the plain word, which does flag slopes (lift 21.9
points), also words two thirds of the units with no event of their own. Its Limits: "a slope and a compounding gap
differ in curvature ... **Next:** a word that reads curvature (the middle third against the line through the outer
two) so a linear slope can be told from compounding growth, pre-registered on these cells."

## The statistic (`gapBend` in `synth-control.mjs`)

The after-gap's signed means over its first, middle and last thirds a, b, c (thirds of floor(m/3) points, the middle
takes the rest); bend = (b - (a + c) / 2) / (c - a): the middle third's distance from the straight line through the
outer two, as a share of that line's rise. 0 for a straight line, negative when the gap speeds up, positive when it
slows; null when c = a or fewer than 6 points.

What the exploratory run showed, which the band follows: clean units' gaps on compounding panels are **not**
systematically convex (median bend of the clean units the plain word calls 'grew', on switched growing panels, -0.07;
10th to 90th percentile -0.31 to 0.16): their spread grows, but each one is a smooth random path that bends either way.
A donor's slope is a straight ramp added on top, so its bend is concentrated near the line (10th to 90th -0.15 to
0.04). So the useful reading is two-sided, "near a straight line", not "did not speed up".

## The flag (frozen)

**straight**: the plain word is 'grew' and the bend lies in **[-0.15, 0.10]**. The band was chosen from nine candidates
listed in the exploratory file (the plain word itself, three one-sided cuts, five two-sided bands) as the one with the
highest odds ratio on switched growing panels (5.57 against the plain word's 3.92) whose big-slope rate stayed over
85%. This is a selection on the exploratory data, so the confirmatory run on a fresh base decides.

## Design (`eval/synth-shape-curve-sim.mjs`, summary `eval/synth-shape-curve-merge.mjs`)

The 80 cells of `eval/synth-shape-switch-sim.mjs` unchanged (trendless, wandering, three growing generators, 11 and 16
units, one donor with its own step, slope or pulse). Every placebo recorded with its plain word, panel word, bend and
whether it is listed at or above the treated unit. "Switched" panels are those where the panel word is in force.

## Bars (confirmatory, switched growing panels, the three generators pooled unless said)

Each compares the straight flag with the plain word 'grew' as a slope flag, on the same units.

1. **A sharper slope flag.** Slope lift (slope donors, shock 1 and 2, flagged minus clean units flagged): straight at
   least plain 'grew' + 8 points.
2. **Better odds, not just off the ceiling.** Odds ratio (slope donors against clean units): straight at least 1.2
   times plain 'grew'.
3. **Fewer clean units flagged.** Clean units flagged: straight at least 20 points below plain 'grew'.
4. **Big slopes kept.** Slope donors at twice the effect flagged straight at least 75%.
5. **Not one generator's.** Bar 1 holds in each of the three growing generators separately.
6. **Pulses not flagged.** Pulse donors flagged straight at most 5%.

Reported, no bar: the "above" variants (what the note words); precision (share of flagged units that are the slope
donor); step donors; trendless and wandering families (where the panel word is off and the flag would not be shown).

## Product change decided now

- **All six hold:** under `--shape-word panel`, on panels where the panel word is in force, each unit listed at or
  above the treated one whose plain word is 'grew' is said to have grown along a straight line from the date (the
  shape of a slope of its own) or to have bent like the panel's gaps; `above[]` gains `bend` and `straight` in that
  mode only (default `--json` unchanged); the note quotes the confirmatory rates, clean units included. The default
  plain word is unchanged.
- **Any bar fails:** `gapBend` and the `bend` field on each `gapShape` stay in the module; the CLI, page and `--json`
  `above` are unchanged, and the README says what failed.
