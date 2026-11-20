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
