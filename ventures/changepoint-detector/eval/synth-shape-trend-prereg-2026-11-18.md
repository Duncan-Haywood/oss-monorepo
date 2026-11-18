# Pre-registration: the gap-shape word read against the panel's own trend (2026-11-18)

Written after one exploratory run (`eval/synth-shape-trend-explore.out.txt`, base 88000, 100 panels a cell) and
committed before the confirmatory run (base 89000, 400 panels a cell, `eval/synth-shape-trend-confirm.out.txt`).

## Why

README "A donor's own event that is not a step" shipped a word for each listed unit's own gap ('faded', 'grew',
'held': `gapShape`, first third of the after-gap against the last, at a frozen ratio of 6). On the real West
Germany 1990 panel 12 of 16 placebos' gaps 'grew', because gaps of GDP per head compound for 14 years whatever
happened, so the word named nearly everyone; the note now says "most share the word, so it singles out no one". Its
next step: "a shape word read against the panel's own trend for long compounding series".

## The rule, frozen here (`panelShapes` in `synth-control.mjs`)

Every unit's gap (treated and placebos) gets log r = log(mean square of last third / mean square of first third).
The panel's centre c is the median of log r over all units. If c >= log 6 (the median unit itself would be called
'grew' at the frozen ratio), each unit is worded against the centre: 'grew' when log r - c >= log 6, 'faded' when
c - log r >= log 6, else 'held'. Otherwise the plain word stands. No new constant: the switch and the cut are the
frozen ratio 6. Call it the hybrid word.

An all-relative variant (always subtract the centre) was looked at first in the exploratory work and cost the
trendless panels' sensitivity (big-slope 'grew' 70% to 54%, pulse 'faded' 89% to 83%); it is not tested here.

## Design (`eval/synth-shape-trend-sim.mjs`)

Three families at 11 and 16 units, 19 points before and 12 after, the treated unit dropping from the date, one donor
(unit 1) with its own step, slope or pulse of average size `shock` (shapes of `eval/synth-donor-shape-sim.mjs`):

- trendless: the donor-shape cells P, PD, PS, PP, PSE, PPE, NS, NP, PB, PBP (N1's generator, unchanged);
- wandering: idiosyncratic sd 0.3 plus a random walk of step sd 0.15 (Wa) or 0.3 (Wb); cells W, WD, WS, WP, WSE, WPE;
- growing: compounding levels, 100 exp(L), L rising 2.5% a point plus a common AR(0.5) growth factor and each unit's
  own AR(0.9) growth deviation (sd 0.005); the treated level drops 10%, the donor's moves by sign x shock x 10% x
  shape. Cells G, GD, GS, GP, GSE, GPE. Calibrated in the exploratory run only to put the median panel's centre near
  6 to 8 (West Germany's is 21.8).

## Bars (confirmatory run; pooled over both unit counts)

1. **No cost where gaps do not grow.** In the trendless and wandering families, every pooled line (pulse 'faded',
   step 'held', big-slope 'grew', slope-1.0 'grew', clean units listed above given a word, all placebos 'grew' and
   'faded') differs between hybrid and plain by at most 1.5 points.
2. **The earlier bars still hold under the hybrid word** (trendless family): pulse 'faded' >= 85%, step 'held'
   >= 85%, big slope 'grew' >= 65%, clean units listed above given a word <= 25%.
3. **Fewer clean units named in growing panels.** Growing family, clean units listed above the treated unit given a
   word: hybrid at least 20 points below plain.
4. **Where the switch is on.** Growing family, panels whose centre switched the rule on: clean units listed above
   given a word, hybrid at most 30%.
5. **Pulses still named.** Growing family, pulse 'faded' (GP, GPE): hybrid at least plain minus 2 points.
6. **'Grew' no longer the rule.** Growing family, all placebos 'grew': hybrid at most 60% of plain's share.

Reported, no bar: growing-family slope 'grew' (expected to fall: a donor's own slope adds to a panel whose gaps all
grow, and the hybrid word reads only how far it stands out), step 'held', the share of panels switched, rank-1 shares.

## Product change decided now

If bars 1 to 5 hold (6 is reported with them but does not gate), the CLI's `--json` `above` entries and
`placeboShapes` use the hybrid word, the page and CLI "ranked above" note print it, and when the panel's centre
switched the rule on the note says so: the median unit's gap grew N times from its first third to its last, the
words read how far a unit's own gap stood out from that, and a donor's own slope cannot be told from the panel's
growth (quoting the confirmatory rates). If any of 1 to 5 fails, `panelShapes` stays in the module only and the
plain word ships as now.
