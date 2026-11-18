# Pre-registration: a donor whose own event is a slope or a pulse, with few units (2026-11-18)

Written after one exploratory run (`eval/synth-donor-shape-explore.out.txt`, base 86000, 100 panels a cell) and
committed before the confirmatory run (base 87000, 400 panels a cell, `eval/synth-donor-shape-confirm.out.txt`).

## Why

README "Few donors: size and power" and "Two shocked donors, and a shocked best match" measured donors whose own
after-date event is a step. Both ended: "a donor with a slope or pulse rather than a step." Real donors' events are
often neither: a promotion or a strike that wears off (a pulse), a competitor opening and taking share month by
month (a slope). The FEW DONORS note quotes step figures only, and the "ranked above" note lists units without saying
what their own gap looked like, which is what a reader needs to go and find the event.

## Design (`eval/synth-donor-shape-sim.mjs`)

The shipped generator in N1's shape (two AR(1) factors, idiosyncratic sd 0.5, 19 points before, 12 after) at 11 and
16 units. Unit 0 is treated (drops by 1.0, two noise sd, from the date, in the P cells). One donor is moved by
sign x shock x shape(h), h = 0..11, sign drawn per panel, with the shapes of `eval/synth-shape-sim.mjs`, each
averaging 1 over the 12 points: step 1; slope (h + 1) / 6.5; pulse 3 for four points, then 0. Cells per U:

- P_U clean; PD_U step 1.0 (replicates the earlier PD cells); PS_U slope 1.0; PP_U pulse 1.0; PSE_U slope 2.0;
  PPE_U pulse 2.0; NS_U and NP_U no effect, slope or pulse 1.0; PB_U, PBS_U, PBP_U: the shocked donor (step, slope,
  pulse, 1.0) is the treated fit's heaviest (weights from the before-period, found before the shock).

Shipped defaults; each panel refitted with the shocked donor left out beforehand (excl).

**The gap-shape label, frozen here.** `gapShape` in `synth-control.mjs`: the mean square of the first third of a
placebo's after-gap against the last third's; 'faded' when the first is at least 6 times the last, 'grew' when the
last is at least 6 times the first, else 'held'; none with fewer than 6 points after the date. The exploratory run
compared ratios 3, 4, 6, 9 and 16 (table at the end of the explore file); 6 is the smallest that keeps step donors
'held' at least 90% of the time while still naming most pulses. The confirmatory run tests 6 only.

## Bars (confirmatory run)

1. **Size.** NS_U and NP_U rank-1 share at most 1/U + 4 points.
2. **A pulse takes more than a step of the same average size.** PP_U rank-1 share at least 8 points below PD_U's,
   in each U. (A pulse's after-gap RMS is 1.73 times a step's of the same average, and the statistic reads RMS.)
3. **A slope takes at least as much as a step.** PS_U rank-1 share at most PD_U's, in each U.
4. **Twice the effect leaves little.** PSE_U at most 20%, PPE_U at most 10%.
5. **Leaving it out restores it.** excl rank-1 share in PS_U, PP_U, PSE_U and PPE_U within 8 points of P_U's, or above.
6. **The shape label.** Over the shocked donors listed at or above the treated unit, pooled over both U:
   (a) pulse cells (PP, NP, PBP, PPE): 'faded' at least 85%; (b) step cells (PD, PB): 'held' at least 85%;
   (c) PSE: 'grew' at least 65%; (d) clean units listed at or above the treated unit, pooled over every cell:
   given any shape at most 25%.

Reported, no bar: PS/NS/PBS 'grew' share at shock 1.0 (about 45% in the exploratory run), the best-match cells'
errors (average and last-point gap), the plain ratio's rank-1 share, rank <= 2.

## Product change decided now, whatever the bars say

1. The FEW DONORS note (CLI and page) adds the confirmatory rank-1 shares at the nearest of 11 and 16 units with one
   donor's own event a slope or a pulse of the effect's average size, and with it left out beforehand; if bar 2
   holds it says that an event that wore off quickly takes the rank more often than a lasting step of the same
   average size.
2. If bar 6 holds in all four parts, the "ranked above" note gives each listed unit's own gap shape when it is not
   'held' ("its own gap faded after the first points" / "grew towards the end"), `--json`'s `above` gains `gapShape`,
   and the note quotes the confirmatory rates, including how often a unit with no event of its own got a shape, so
   the word reads as a hint of what to look for and not as evidence of an event. If any part fails, the label is not
   shown and `gapShape` stays in the module only.
