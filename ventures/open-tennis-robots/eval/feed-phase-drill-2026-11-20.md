# The fast survey drill against the long one, both at the shipped margins, on fresh seeds (2026-11-20)

Item from `ventures/open-tennis-robots/NEXT.md` ("Buildable here", the take-straddle line): "the fast drill against
the long drill, both at the shipped margins, pre-registered on fresh seeds".

## Why this test

eval/feed-phase-margin-2026-11-20.md tested the pair "fast drill, margin 3" against the shipped "long drill, margin 2"
and failed it. On the same 576 builds, explored after the fact, the fast drill at the shipped margins (fast@2) named
75 of 108 short (1.3-2.1 ms) takes against the long drill's 66, 67 of 72 long (2.4-2.8 ms) takes against 61, and
misadvised 2 of 108 instant builds against 2. Both drills are 24 shots at a 4 s interval
(`eval/feed-phase-drill-fast-2026-11-20.json` is drill.survey-long.json's placement at 34-40 m/s instead of 16-26), so
the swap costs no balls and no time on court; the only change is how hard the machine hits during the survey. Those
576 builds are design data now; this test uses seeds no stored set has used.

Both margins stay at the shipped values in both arms (`host.TAKE_STRADDLE_MARGIN = 2`,
`host.TAKE_STRADDLE_LONG_MARGIN = 2`). One exploratory row, not part of the rule: the fast drill with the 2.5 ms vote
at margin 3 (`fast@2/3`, the new `@N/L` label in `tests/take_straddle_count.py`), since one of the fast drill's two
design-set false alarms was a 4-1 in that vote.

## Sets (fresh seeds; the same design as the margin test)

Jittery tach (`--tach 1`), lag 0.5 s, three launchers, `--feed-jitter 26`, for each drill:

- spread: takes 1.3, 1.6, 2.0, 2.4, 2.8 ms on seeds 9501-9523 odd (12 seeds, 180 builds: 108 short, at 1.3, 1.6
  and 2.0 ms, and 72 at 2.4-2.8 ms)
- instant (take 0): seeds 9601-9671 odd (36 seeds, 108 builds)

Both drills on the same seeds. Scored with `tests/take_straddle_count.py` (labels `long` and `fast`), a spread take
named when the advised TAKE_US is within 1 ms of the true take, an instant build misadvised when told to set one.

## Prediction (written and committed before either capture ran)

(a) the fast drill names more short takes than the long one (design: 75 against 66 of 108; here about 70-78 against
60-68); (b) it names at least as many 2.4-2.8 ms takes (design 67 against 61 of 72); (c) its false alarms are about
the same, 1-4 of 108 in each arm, since its larger straddle counts make chance runs of "for" votes longer too
(the margin test's finding); (d) its gain is largest at 1.3 and 1.6 ms, where the long drill has fewest straddling
balls.

## Rule (written with the prediction)

The fast drill ships, i.e. becomes the README's recommended survey drill (`drill.survey-fast.json` at the repository's
venture root, the calibration placement at 34-40 m/s), only if on these sets, at the shipped margins:

1. it names at least 4 more of the 108 short takes than the long drill (half the design set's gain of 9);
2. it names at least as many 2.4-2.8 ms takes as the long drill, less one;
3. it misadvises no more than one instant build more than the long drill, and at most 3 of 108.

Otherwise the long drill stays the recommended survey drill and the fast drill stays a measured option in eval/.
The `fast@2/3` row decides nothing: a 2.5 ms margin change would need its own pre-registered test.

Simulated only, as every take-survey result is: one lag, one tach model, a uniform 0-26 ms release hold. A drill at
34-40 m/s is within what ball machines throw, but the survey would be run with the court clear.

## Result

(Filled in after the captures.)
