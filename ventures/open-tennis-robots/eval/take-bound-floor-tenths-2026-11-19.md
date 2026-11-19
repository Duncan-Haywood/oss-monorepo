# The bound's ppm floor on tenths (2026-11-19, firmware/esp32/README.md, same title)

Item from `portfolio/flagships.yaml` (open-tennis-robots `buildable:`): "TAKE_BOUND_FLOOR_PPM (2, set on whole ppm)
retested on tenths with a held-out set".

`host.TAKE_BOUND_FLOOR_PPM = 2` was chosen when the TAKE_SURVEY frame carried whole ppm (eval/take-bound-floor-p-2026-11-19.md):
one ppm of rounding is 5-6% at a 16-20 ppm step and cleared the 2% bar alone. The tenths frame
(eval/take-share-tenths-2026-11-19.md) cut the rounding to 0.05 ppm. If rounding was the floor's only job, a smaller floor
should now cover as many builds and name 1.5 ms on more instant builds.

## Design (all seen: J-L, M, N dense refits; O and P captures)

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_bound_floor_tenths.py --design eval/take-dense-jkl-2026-11-19.jsonl.gz eval/take-dense-m-2026-11-19.jsonl.gz eval/take-dense-n-2026-11-19.jsonl.gz eval/take-bound-o-2026-11-19.jsonl.gz eval/take-bound-floor-p-2026-11-19.jsonl.gz

Every build is rescored into both frames from its stored per-wheel scores, using the board's own `ResidualSurvey`
(the shipped trim and blind rule). Pooled over 480 builds with a survey, 242 of them are told TAKE_US = 0 in either
frame (eval/take-bound-floor-tenths-design-2026-11-19.txt):

| frame, floor | covered (true take at most the bound) | instant builds bounded at 1.5 ms |
| --- | --- | --- |
| whole ppm, 2 (shipped) | 242 of 242 | 25 of 42 |
| tenths, 0 / 0.1 / 0.2 | 235 of 242 | 31 of 42 |
| tenths, 0.3 | 236 | 31 |
| tenths, 0.5 | 239 | 30 |
| tenths, 1 | 240 | 28 |
| tenths, 2 | 242 of 242 | 27 of 42 |

Rounding was not the floor's only job. On tenths the seven misses under a small floor are real: for example, set O's
two 2.0 ms takes at 16.2 and 19.5 ppm steps are still bounded at 1.5 ms with exact tenths. Their 2 ms candidate's
summed fit sits a little over 2% above the step's for reasons that have nothing to do with the frame. The floor is
acting as a noise margin. A relative bar alone (2-20%, with floor 0, 1 or 2) does no better: 10-12% covers 242 of 242
but bounds only 24 of 42 instant builds at 1.5 ms, and 15-20% bounds 20-21 of them
(scratch sweep, reproduced by changing `take_bound_floor_tenths.TOL`). So the design keeps 2% and 2 ppm. On tenths
that already tightens the instant builds' bound from 25 to 27 of 42 at no cost in coverage.

## Prediction and rule (written before sets W and X were captured)

Sets: W, wheel lag 0.46 s, seed 139; X, wheel lag 0.38 s, seed 151. Neither lag-seed pair was used by an earlier take
capture. Both use the same takes, tachs and launchers as O and P (66 drills each), captured with
`tests/take_survey_pick.py --capture` on today's tree, and are scored pooled.

PREDICTION: with floor 2 on the tenths frame, the true take is at most the bound on at least 95% of builds told
TAKE_US = 0, and on at least as many as with floor 0. The bound is 1.5 ms on at least half the instant builds.

DECISION RULE: if both clauses hold, `host.TAKE_BOUND_FLOOR_PPM` stays 2 for the tenths frame, and its comment is
rewritten from "rounding" to "noise margin" with these numbers. If either fails, host stays as it is (no change is
licensed by a failure) and the floor's shape goes back to NEXT.md with W's and X's numbers.

## Result

(filled in after the capture)
