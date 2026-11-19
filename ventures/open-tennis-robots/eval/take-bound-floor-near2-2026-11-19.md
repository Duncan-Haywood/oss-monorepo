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

## Result

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_survey_pick.py --capture y.jsonl --lag 0.50 --seed 157 --procs 2 --takes "1.8,1.9,2.0,2.1,2.2,0"
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_survey_pick.py --capture z.jsonl --lag 0.34 --seed 163 --procs 2 --takes "1.8,1.9,2.0,2.1,2.2,0"
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_bound_floor_tenths.py --heldout eval/take-bound-floor-near2-y-2026-11-19.jsonl.gz eval/take-bound-floor-near2-z-2026-11-19.jsonl.gz

All 72 drills completed with a survey (eval/take-bound-floor-near2-heldout-2026-11-19.txt). 54 builds were told
TAKE_US = 0 in both frames.

| frame, floor | covered (true take at most the bound) | instant builds bounded at 1.5 ms |
| --- | --- | --- |
| whole ppm, 2 (the old frame) | 54 of 54 | 4 of 12 |
| tenths, 0 to 0.3 | 51 of 54 | 7-8 of 12 |
| tenths, 0.5 and 1 | 52 of 54 | 6-7 of 12 |
| tenths, 2 (shipped) | 54 of 54 | 5 of 12 |

Both clauses held: floor 0 covers 3 fewer builds than floor 2, and floor 2 covers 100%. So the floor is shown needed on
held-out data, and `host.TAKE_BOUND_FLOOR_PPM`'s comment now cites Y and Z. Nothing on the board or the Pi changed.

**Where the misses are.** All three are set Z (lag 0.34 s), 1.9, 2.0 and 2.1 ms takes bounded at 1.5 ms, at step rms
of 6 to 8.7 ppm. At those steps 2% is 0.12-0.17 ppm, below the run-to-run noise of a sum over about 15 wheels, so the
1.5 ms candidate (which fits a 2 ms take worse than the step does at most by a hair) clears it by chance. A 1 ppm floor
still misses two of them. This is the same shape as the design sets' seven misses: a small-rms build, where an absolute
margin matters and a relative one does not.

**What the floor costs.** Not part of this rule, but worth saying: the shipped tool also prints W and X's tightness
clause (instant builds bounded at 1.5 ms on half), and on Y and Z floor 2 bounds 5 of 12, against 8 at floor 0. The
instant builds that loosen are the same small-rms builds. A floor scaled to the survey's own noise (a standard error
over the kept wheels, which the board could send) might keep the coverage and win the tightness back; that is the next
item in NEXT.md, and it needs its own design and held-out sets.

**Not known.** Simulated only, two tach models and three launchers. Real wheels' step rms on a good tach is unmeasured,
so how often a real build sits at 6-9 ppm, where this matters, is unknown.
