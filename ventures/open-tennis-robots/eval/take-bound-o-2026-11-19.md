# Short takes that read 0: no ball saw them, and the Pi now names the bound (2026-11-19)

Script: `tests/take_shelf_bound.py` (prediction and rule committed in 020e567c9 before set O was captured).
Simulated only.

## Why the 1.4-1.9 ms takes read 0

`eval/take-short-n-2026-11-19.md` left its large misses as "1.4-1.9 ms takes reading 0, where the summed curve's shelf
hides the valley". The stored dense refits (sets J to L, M, N; every 0.25 ms) say otherwise
(`take-shelf-trace-2026-11-19.txt`). For each kept wheel, count it as *seeing* the true take when its squared rms at
the dense candidate nearest the take is at most 0.8 of the step's:

| builds at 1-2.5 ms (J to L, M, N) | builds | with no seeing wheel | with one |
| --- | --- | --- | --- |
| off by more than 1 ms | 17 | 11 | 3 |
| the rest | 61 | 8 | - |

On those builds there is no valley to hide. A take shorter than a revolution (10-27 ms at the survey's speeds, one
tach pulse a revolution) moves a wheel's fit only when the ball's contact straddles a revolution's edge; the wheels the
board keeps can be kept for what they say about the 6-8 ms candidates alone. The instant builds' summed curves stay
within 2% of the step's to 1.5-2.25 ms on 11 of 30: the same shape. From those balls no grid or pick can tell a
1.4-1.9 ms take from an instant one (the 8 builds with no seeing wheel that read within 1 ms did so by the parabola's
lean, not by evidence).

## What the balls do say: an upper bound

The first grid candidate whose mean rms is more than 2% over the step's is a take the balls *can* tell from an
instant one. When the Pi tells a builder TAKE_US = 0, it now names it: "these balls cannot tell an instant take from
one up to X ms".

Design (J to L, M, N, seen): 145 builds told TAKE_US = 0, the true take at most X on 145; X was 1.5 ms on 20 of 30
instant builds. 1% and 5% gave the same coverage within one build.

Rule, written before set O: ships only if, on set O, the true take is at most the bound on at least 95% of the builds
told TAKE_US = 0, and the bound is 1.5 ms on at least half the instant builds.

## Set O

Wheel lag 0.42 s, seed 109 (neither used by an earlier take capture); takes 0.1, 0.5, 0.9, 1.3, 1.6, 2.0, 2.4, 2.8,
3.5, 5.0 ms and instant; two tachs, three launchers; 66 drills, the board's own TAKE_SURVEY frames with the nine-point
grid live (`take-bound-o-2026-11-19.jsonl.gz`, `take-bound-o-2026-11-19.txt`).

| | result | needed |
| --- | --- | --- |
| builds told TAKE_US = 0 | 49 of 66 | |
| true take at most the bound | 47 (95.9%) | 95% |
| instant builds with the bound at 1.5 ms | 4 of 6 | half |

Both clauses held, so **`host.take_survey_advice` names the bound** (`host.take_survey_bound`, `TAKE_BOUND_TOL =
0.02`; older boards' eight- and seven-candidate frames are read on their own grids). It changes no number on the
board and no verdict: only what the line tells the builder.

It held by one build. The two misses are 2.0 ms takes on the 1/8 us capture tach whose step rms is 16 and 19 ppm:
the frame carries whole ppm, so one ppm is 5-6% there, and the 1.5 ms candidate at 18 and 20 ppm cleared the 2% bar
by one or two ppm. A tolerance with a ppm floor (say the larger of 2% and 2 ppm) would have put both bounds above
the true take (2.5 and 3 ms); it was not tried, because changing it after seeing O would be a change of rule. It goes to NEXT.md for a fresh set.

Set O also shows how often a real take is told "keep 0" (49 of 66, including two 5 ms builds whose best fit was only
9-22% under the step's): those two now read "up to 6 ms" and "up to 7 ms", which tells the builder the survey did not
settle it, where the old line read as a verdict.

## Not known

All simulated, one seed for the rule. Whether real ball contacts fall under 3 ms is unmeasured. The deeper limit is
the tach: one pulse a revolution. More pulses a revolution would give each ball more edges to straddle; that needs the
simulator's tach, the board's fit and a magnet layout, none built.

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_shelf_bound.py --trace eval/take-dense-jkl-2026-11-19.jsonl.gz eval/take-dense-m-2026-11-19.jsonl.gz eval/take-dense-n-2026-11-19.jsonl.gz
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_survey_pick.py --capture o.jsonl --lag 0.42 --seed 109 --takes "0.1,0.5,0.9,1.3,1.6,2.0,2.4,2.8,3.5,5.0,0"
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_shelf_bound.py --heldout eval/take-bound-o-2026-11-19.jsonl.gz
