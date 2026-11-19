# The bound's ppm floor on takes near 2 ms (2026-11-19, firmware/esp32/README.md, same title)

Item from `portfolio/flagships.yaml` (open-tennis-robots `buildable:`): "a fresh set with 1.8-2.2 ms takes to show
whether the floor is needed on tenths".

"The bound's ppm floor on tenths" (eval/take-bound-floor-tenths-2026-11-19.md) kept `host.TAKE_BOUND_FLOOR_PPM = 2`
on the tenths frame. Its held-out sets W and X could not separate floors 0 to 2: every floor covered 97 of 97. The
evidence that the floor does work rested on the design sets' seven misses at floor 0, real 1.6-3.5 ms takes whose
first candidate past the take sat just over the 2% bar. This note captures sets aimed at that case.

## Prediction and rule (written and committed before sets Y and Z were captured)

Sets: Y, wheel lag 0.50 s, seed 157; Z, wheel lag 0.34 s, seed 163. Neither seed was used by an earlier take
capture. Takes 1.8, 1.9, 2.0, 2.1, 2.2 ms and 0 (instant), on the same two tachs and three launchers as W and X
(36 drills a set), captured with `tests/take_survey_pick.py --capture` on today's tree, scored pooled by
`tests/take_bound_floor_tenths.py --heldout` (unchanged).

PREDICTION: on the tenths frame, floor 0 covers fewer builds told TAKE_US = 0 than floor 2 (at least one miss more),
and floor 2 covers at least 95% of them.

DECISION RULE: nothing on the board or the Pi changes either way; this is a test of whether the shipped floor earns
its place. If both clauses hold, the floor is shown needed on a held-out set and its comment cites Y and Z. If floor 0
ties floor 2 on coverage, the floor stays 2 (one tie on 72 drills does not license loosening a noise margin that the
design needed) and the floor's need goes back to NEXT.md as unshown on held-out data. If floor 2 covers under 95%,
the floor stays 2 and the miss shape goes to NEXT.md as a new item.
