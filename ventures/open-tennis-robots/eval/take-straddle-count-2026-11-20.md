# Straddling wheels per drill against the survey's length (2026-11-20, firmware/esp32/README.md, same title)

Item from `ventures/open-tennis-robots/NEXT.md` ("Buildable here", 2026-11-19): "a survey drill with more straddling
balls (a longer drill.calibration.json survey; count straddles per drill before any threshold), then rescore".

Every straddle rule tried on 2026-11-19 (margin 1, a binomial margin, the vote in the bound) stalled on the same thing:
a twelve-shot calibration drill gives a 1.3-2.1 ms take at most five straddling wheels, and most such builds read 0
because they have one straddling wheel or none (the 0-0 and 1-0 rows of eval/take-straddle-scaled-2026-11-19.md). The
cheapest lever is not a new rule but more wheels: run the survey longer. This measures what that buys and what it costs.

## What changed in the tools

- `tests/take_misfit_trace.py`: `SURVEY_DRILL` names the drill `capture_survey` runs (default `drill.calibration.json`,
  so every stored capture reproduces).
- `tests/take_survey_pick.py --drill FILE`: capture with another survey drill; each row records it in `drill`.
- `drill.survey-long.json`: the calibration drill's twelve shots, twice (24 balls, 96 s of feeding at 4 s).
  A triple (36 shots) was captured from a scratch file for the curve only.

## Prediction and rule (written and committed before any capture below ran)

Matched builds: jittery tach (`--tach 1`), lag 0.5 s, three launchers, the same seeds on every drill length. Spread
set: takes 1.3, 1.6, 2.0, 2.4, 2.8 ms, seeds 9101, 9103, 9107, 9109 (60 builds a length). Instant set: take 0, seeds
9201-9223 odd (36 builds a length). None of these seeds was used by an earlier capture.

Prediction: (a) the mean count of straddling kept wheels at 1.5 ms (for + against) per build grows about in proportion
to the drill's length (x2 and x3 within 30% of 2x and 3x the standard drill's); (b) with the shipped rules unchanged
(margin 2 at 1.5 ms and 2.5 ms, `host.take_survey_advice`), the long drill names more 1.3-2.1 ms takes (within 1 ms) than
the standard drill; (c) it tells no instant build to set a take.

Rule: `drill.survey-long.json` becomes the README's recommended survey drill for a build whose short survey read
TAKE_US = 0 only if, on these sets, it names at least 1.5x as many 1.3-2.1 ms takes as the standard drill, names no
fewer 2.4-2.8 ms takes, and misadvises 0 of 36 instant builds. Nothing on the board or in `host.py` changes either
way: the drill is a file the user runs. Otherwise it stays a measured option and the item goes back to NEXT.md.

## Result (captured after the pre-registration, commit 58748945c)

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_straddle_count.py --procs 4 \
      std=eval/take-straddle-count-spread-std-2026-11-20.jsonl.gz,eval/take-straddle-count-inst-std-2026-11-20.jsonl.gz \
      long=eval/take-straddle-count-spread-long-2026-11-20.jsonl.gz,eval/take-straddle-count-inst-long-2026-11-20.jsonl.gz

    std: 96 builds
      instant: 36 builds; per build: survey wheels 22.0, kept 8.0, straddling at 1.5 ms 1.42 (max 3, none on 5); misadvised 0 of 36
      1.3-2.1 ms: 36 builds; per build: survey wheels 22.0, kept 7.7, straddling at 1.5 ms 1.58 (max 3, none on 1); named 17 of 36
      2.4-2.8 ms: 24 builds; per build: survey wheels 22.0, kept 7.3, straddling at 1.5 ms 1.79 (max 4, none on 2); named 24 of 24
    long: 96 builds
      instant: 36 builds; per build: survey wheels 46.0, kept 14.8, straddling at 1.5 ms 2.33 (max 4, none on 1); misadvised 0 of 36
      1.3-2.1 ms: 36 builds; per build: survey wheels 46.0, kept 14.3, straddling at 1.5 ms 2.72 (max 5, none on 0); named 26 of 36
      2.4-2.8 ms: 24 builds; per build: survey wheels 46.0, kept 14.2, straddling at 1.5 ms 3.17 (max 6, none on 1); named 24 of 24

By take (named of 12 each): 1.3 ms 2 -> 4, 1.6 ms 6 -> 11, 2.0 ms 9 -> 11, 2.4 and 2.8 ms 12 -> 12. Paired on the same
builds, the long drill named 9 short-take builds the standard drill missed and lost none. The survey's own feeding
wait (`wait_s`) was 141 s on the standard drill and 294 s on the long one. No build aborted.

| clause | needed | got | |
| --- | --- | --- | --- |
| (a) straddles grow with length | 1.4x-2.6x at 2x | 1.72x (1.3-2.1 ms band); 1.64x instant | held |
| (b) more 1.3-2.1 ms named | > 17 | 26 | held |
| (c) no instant build misadvised | 0 | 0 of 36 | held |
| rule: at least 1.5x as many 1.3-2.1 ms named | >= 25.5 | 26 (1.53x) | held, by one build |
| rule: no fewer 2.4-2.8 ms named | >= 24 | 24 | held |

**Decision.** The rule held, so `drill.survey-long.json` is the README's recommended survey when the standard survey
reads TAKE_US = 0 and a short contact is suspected (README "Running a drill on the machine"). Nothing on the board or in
`host.py` changed.

**The triple drill (curve only, stopped early).** 36 shots (eval/take-straddle-count-drill-triple-2026-11-20.json), seeds
9101 and 9103 only (30 spread builds, no instant set; stopped to keep the run's time): 70 survey wheels, kept 21.1,
straddling 3.28 a 1.3-2.1 ms build (max 6) and 4.00 at 2.4-2.8 ms (max 7); 13 of 18 short takes named, 12 of 12 longer.
Straddles keep growing more slowly than the drill (2.1x the standard for 3.2x the wheels). With no instant set it says
nothing about misadvice, so it is not recommended.

**Not known.** The 1.5x clause held by one build. 1.3 ms takes are still mostly missed (4 of 12). The scaled margin
(eval/take-straddle-scaled-2026-11-19.md) acts only from 7 straddling wheels; the long drill's maximum is 5 and the
triple's 7, so a rescore with tests/take_straddle_scaled.py still cannot move on these drills. Twice the balls and
drill time; a real ball wears, so a long survey's late balls may not match its early ones. One lag, one tach model,
simulated only.
