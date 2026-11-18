# Pre-registration: the panel word scored where it switches on (2026-11-18)

Written after one exploratory run (`eval/synth-shape-switch-explore.out.txt`, seed base 89000, 100 panels a cell; the
earlier cells at that base are the earlier exploratory run's panels, the H and K cells are new) and committed before
the confirmatory run (fresh seed base **93000**, 400 panels a cell, `eval/synth-shape-switch-confirm.out.txt`).

## Why

README "The shape word against the panel's own trend" failed its bar 1 by 0.4 points on a line pooled over every
wandering panel, though the plain and panel words are identical on every panel where the rule stays off (it switched
on in 1-3% of wandering panels). README "The panel word as an option" shipped `--shape-word panel` opt-in and named
this re-test: "a fresh pre-registration scored only where the rule switches on, which would decide whether the panel
word can become the default".

The earlier test also scored a slope donor only by how often it was called 'grew', pooled over all growing panels
(33%, about the 27% of all placebos called 'grew'). It never asked whether a slope donor is worded more or less often
than a clean unit **on the panels where the panel word is in force**. The exploratory run here does, and the answer is
less: on switched growing panels a donor's big slope is called 'held' 87.8% of the time (plain 6.6%), and a slope donor
is given any word 15.3% of the time against 29.0% for a clean unit, a flag lift of -13.7 points (plain +19.6). The
panel word's 'held' hides exactly the event the "ranked above" note exists to point at. Pulses go the other way:
'faded' lift 78.8 points against 69.6.

So this round is a confirmation on fresh panels of an exploratory finding that predicts bars 3 and 4 fail. The bars
were written from that reading, not tuned to pass; if the confirmatory panels disagree with the exploratory ones the
bars decide.

## The rule (unchanged, `panelShapes` in `synth-control.mjs`)

As frozen in `eval/synth-shape-trend-prereg-2026-11-18.md`: the panel's centre is the median of
log(late-third / first-third mean square) over every unit; when it reaches log 6 each unit is worded by how far it
stands from the centre at log 6, else the plain word stands. No change to the rule or the constant.

## Design (`eval/synth-shape-switch-sim.mjs`, summary `eval/synth-shape-switch-merge.mjs`)

Every cell of `eval/synth-shape-trend-sim.mjs` (trendless, wandering, growing with AR(0.9) deviations of sd 0.005) plus
two growing generators that run did not have: AR(0.7) deviations of sd 0.01 (H cells) and AR(0.97) of sd 0.0025
(K cells); each at 11 and 16 units, 19 points before and 12 after, one donor with its own step, slope or pulse.
Scored on every placebo: both words for the shocked donor, and the word counts over all clean units and over the clean
units listed at or above the treated one. "Switched" panels are those whose centre reached 6.

## Bars (confirmatory, switched panels only, the three growing generators pooled unless said)

1. **Fewer clean units worded.** Clean units given a word: panel at least 25 points below plain.
2. **Pulses named as well.** Pulse lift (pulse donors 'faded' minus clean units 'faded'): panel at least plain.
3. **Slopes named as well.** Slope lift (slope donors, shock 1 and 2, 'grew' minus clean units 'grew'): panel at least
   plain minus 5 points.
4. **A slope is not hidden.** Slope flag lift (slope donors given any word minus clean units given any word): panel at
   least 0 points.
5. **Not one generator's.** Bar 1 holds in each of the three growing generators separately.

Reported, no bar: step donors 'held'; big slope 'held'; the "above" variants; the share of panels switched per
family; the wandering family's switched panels (about 0.6% of them, too few to bar); trendless (never switches in the
exploratory run, so the two words should agree exactly there).

## Product change decided now

- **All five hold:** `--shape-word panel` becomes the default (CLI, `synthResult`, page select), `plain` stays as an
  option, and the note quotes the confirmatory switched-panel rates.
- **Any of 3 or 4 fails** (expected): the plain word stays the default. The opt-in note is corrected to quote the
  switched-panel rates from the confirmatory file, since its numbers today are pooled over growing panels where the
  rule mostly did not switch and the note only prints them on panels where it did: it says how often a donor's own
  slope is called 'held' under the panel word and that a unit the plain word calls 'grew' and the panel word 'held'
  may carry a slope of its own. Under `--shape-word panel` the "ranked above" list then gives both words where they
  disagree, so a reader never sees a lone 'held' that the plain word contradicts.
- **1, 2 or 5 fails and 3 and 4 hold:** the plain word stays the default and the note quotes the new rates.
