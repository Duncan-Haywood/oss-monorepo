# The take-blind rule rechecked on the nine-point grid (2026-11-19, firmware/esp32/README.md, same title)

Item from `portfolio/flagships.yaml` (open-tennis-robots `buildable:`): "TAKE_SURVEY_BLIND's 1.5 rechecked on a fresh
jittery-tach set at the nine-point grid".

`controller.TAKE_SURVEY_BLIND = 1.5` was chosen on 2026-11-18 (README "The take survey skips take-blind wheels") on the
seven-point grid (0, 2-6, 8 ms) and scored by the share test of that day: whole-ppm rms against `TAKE_ADVISE_RATIO`.
Since then the board's grid has nine points (0, 1.5, 2-8 ms), the frame carries tenths of a ppm, and
`host.take_survey_advice` has the rounding guard. A wheel is left out when its worst candidate's squared rms is at most
`blind` times its best's, so a grid with a candidate as near the step as 1.5 ms may leave out a different set.

`tests/take_blind_nine.py` (new) rebuilds each stored capture's frame at several `blind` values and judges it by the
Pi's own advice line: a spread take is named when the advised `TAKE_US` (0 for "keep") is within 1 ms of the true take,
and an instant build is bad when it is told to set a take above 0.

## Design (stored nine-point sets, all seen before)

Sets O, P, W, X, Y, Z and N re-run on nine points (the seven captures that carry their own true take), 201 builds per
tach (eval/take-blind-nine-design-2026-11-19.txt):

| blind | capture 1/8 us: named (of 180) | jittery 0.5 us: named (of 180) | instant told to set a take (both, of 42) |
| --- | --- | --- | --- |
| 1 (off) | 111 | 57 | 0 |
| 1.25 | 127 | 73 | 0 |
| 1.5 (shipped) | 127 | 75 | 0 |
| 2 | 130 | 76 | 0 |
| 3 | 133 | 79 | 0 |
| 5 | 137 | 81 | 0 |

The rule still earns its place on nine points (off -> 1.5: +16 capture, +18 jittery). Above 1.5 the gain is small and
steady, a few builds per step, with no instant build misadvised. The design's candidate is 3: the next step a
round-number change would take, gaining 4 jittery builds on the design (5 would gain 6 but leaves out 74% of the
jittery wheels, against 71% at 1.5).

## Prediction and rule (written and committed before sets AA and AB were captured, in d2bd6610a)

Sets: AA, wheel lag 0.42 s, seed 167; AB, wheel lag 0.54 s, seed 173. Neither seed was used by an earlier take capture
(the stored ones are 7-163 and 401-443). Jittery tach only (`--tach 1`, the board's default tach, where the item asks),
three launchers, takes 0.1, 0.5, 0.9, 1.3, 1.6, 2.0, 2.4, 2.8, 3.5, 5.0 ms and 0 (W and X's list): 33 drills a set,
captured with `tests/take_survey_pick.py --capture` on today's tree and scored pooled by `tests/take_blind_nine.py
--blinds 1,1.5,3`.

PREDICTION: on AA and AB pooled, (a) 1.5 names more spread takes than 1 (the rule still pays on nine points), and
(b) 3 names at least as many as 1.5, with (c) no instant build told to set a take at either.

DECISION RULE: `TAKE_SURVEY_BLIND` moves to 3 only if 3 names more spread takes than 1.5 (at least one more, pooled),
tells no instant build to set a take, and has no build with no verdict that 1.5 gave one. A tie keeps 1.5 (a change of
rule on a tie buys nothing). If (a) fails, 1.5 stays and the rule's value on nine points goes back to NEXT.md as
unshown on held-out data.

## Result

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_survey_pick.py --capture aa.jsonl --lag 0.42 --seed 167 --procs 2 --takes "0.1,0.5,0.9,1.3,1.6,2.0,2.4,2.8,3.5,5.0,0" --tach 1
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_survey_pick.py --capture ab.jsonl --lag 0.54 --seed 173 --procs 2 --takes "0.1,0.5,0.9,1.3,1.6,2.0,2.4,2.8,3.5,5.0,0" --tach 1
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_blind_nine.py --blinds 1,1.5,3 eval/take-blind-nine-aa-2026-11-19.jsonl.gz eval/take-blind-nine-ab-2026-11-19.jsonl.gz

All 66 drills completed with a survey, none aborted (eval/take-blind-nine-heldout-2026-11-19.txt).

| blind | AA named (of 30) | AB named (of 30) | pooled (of 60) | instant told to set a take (of 6) | no verdict | wheels left out (of 1,452) |
| --- | --- | --- | --- | --- | --- | --- |
| 1 (off) | 10 | 12 | 22 | 0 | 0 | 0 |
| 1.5 (shipped) | 12 | 18 | 30 | 0 | 0 | 1,083 |
| 3 | 12 | 18 | 30 | 0 | 0 | 1,105 |

(a) held (30 against 22), (b) held as a tie, (c) held. By the rule a tie keeps 1.5, so **`TAKE_SURVEY_BLIND` stays
1.5**, now shown to pay on held-out nine-point data on the jittery tach; its comment in `controller.py` cites AA and AB.
Nothing on the board or the Pi changed.

**Where the gain is.** Per take (pooled, six drills each; the same file): takes of 0.1-0.9 ms are named at every blind
because "keep 0" is within 1 ms of them, and 1.3-2.0 ms takes are read as instant at every blind. The whole gain is at
2.4-5 ms: 4 of 24 such builds advised within 1 ms with every wheel kept, 12 of 24 at 1.5. Going on to 3 left out 22
more wheels and moved no verdict. So on this tach the rule's work is done by 1.5; what is left is the 1.3-2 ms takes,
which no blind value reached on design or held-out sets (the floor and bound notes say why: their 1.5 ms candidate is
within noise of the step).

**Not known.** Simulated only, one tach model (0.5 us jitter), three launchers, two seeds. A real wheel's blind rows
will not tie as exactly as the simulator's, so the share of wheels left out (75% here) is the first thing to read off a
real survey (the TAKE_SURVEY frame's `kept`).
