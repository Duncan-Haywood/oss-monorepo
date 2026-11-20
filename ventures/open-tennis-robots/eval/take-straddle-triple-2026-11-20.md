# The 36-shot survey drill: the instant set it lacked (2026-11-20, firmware/esp32/README.md, same title)

Item from `ventures/open-tennis-robots/NEXT.md` ("Buildable here", 2026-11-19, last line): "an instant set for the
36-shot drill (eval/take-straddle-count-drill-triple-2026-11-20.json, 30 spread builds only)".

eval/take-straddle-count-2026-11-20.md measured a triple survey (the calibration drill's twelve shots three times) on
seeds 9101 and 9103 only and stopped: 13 of 18 short takes named, but with no instant (take 0) builds it could say
nothing about telling a build with no short contact to set a take, so it was not recommended. This run captures the
missing pieces on the same matched settings and decides.

## Sets (same settings as eval/take-straddle-count-2026-11-20.md)

Jittery tach (`--tach 1`), lag 0.5 s, three launchers, drill
`eval/take-straddle-count-drill-triple-2026-11-20.json`.

- Spread: takes 1.3, 1.6, 2.0, 2.4, 2.8 ms, seeds 9107 and 9109 (30 builds), added to the stored 9101 and 9103 builds
  (eval/take-straddle-count-spread-triple-2026-11-20.jsonl.gz), so the triple has the same 60 spread builds the
  standard and long drills have.
- Instant: take 0, seeds 9201-9223 odd (36 builds), the seeds the standard and long instant sets used.

## Prediction and rule (written and committed before any capture below ran)

Prediction: (a) 0 of 36 instant builds misadvised; (b) the triple names more 1.3-2.1 ms takes than the long drill's 26
of 36, about 29; (c) all 24 of the 2.4-2.8 ms takes named; (d) at least one spread build reaches 7 straddling wheels at
1.5 ms, where the scaled margin (eval/take-straddle-scaled-2026-11-19.md) first differs from margin 2.

Rule: the README names the triple as the next step after the long drill (for a build whose long survey still reads
TAKE_US = 0 with a short contact suspected) only if, on the full sets, it misadvises 0 of 36 instant builds, names at
least 30 of 36 1.3-2.1 ms takes (four more than the long drill, so one lucky build cannot carry it) and no fewer than
24 of 24 2.4-2.8 ms takes. Nothing on the board or in `host.py` changes either way. Otherwise the triple stays a
measured option, and the README says the long drill is as far as the survey should go.

## Result (captured after the pre-registration, commit 908bba03f)

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_survey_pick.py --capture spread.jsonl --lag 0.5 \
      --seed 9107 --takes 1.3,1.6,2.0,2.4,2.8 --tach 1 --drill eval/take-straddle-count-drill-triple-2026-11-20.json   # and 9109
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_survey_pick.py --capture inst.jsonl --lag 0.5 \
      --seed 9201 --takes 0 --tach 1 --procs 3 --drill eval/take-straddle-count-drill-triple-2026-11-20.json   # 9201-9223 odd
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_straddle_count.py --procs 4 \
      long=eval/take-straddle-count-spread-long-2026-11-20.jsonl.gz,eval/take-straddle-count-inst-long-2026-11-20.jsonl.gz \
      triple=eval/take-straddle-count-spread-triple-2026-11-20.jsonl.gz,eval/take-straddle-triple-spread-2026-11-20.jsonl.gz,eval/take-straddle-triple-inst-2026-11-20.jsonl.gz

    long: 96 builds
      instant: 36 builds; per build: survey wheels 46.0, kept 14.8, straddling at 1.5 ms 2.33 (max 4, none on 1); misadvised 0 of 36
      1.3-2.1 ms: 36 builds; per build: survey wheels 46.0, kept 14.3, straddling at 1.5 ms 2.72 (max 5, none on 0); named 26 of 36
      2.4-2.8 ms: 24 builds; per build: survey wheels 46.0, kept 14.2, straddling at 1.5 ms 3.17 (max 6, none on 1); named 24 of 24
    triple: 96 builds
      instant: 36 builds; per build: survey wheels 70.0, kept 21.7, straddling at 1.5 ms 3.89 (max 8, none on 0); misadvised 0 of 36
      1.3-2.1 ms: 36 builds; per build: survey wheels 70.0, kept 21.8, straddling at 1.5 ms 3.39 (max 6, none on 0); named 27 of 36
      2.4-2.8 ms: 24 builds; per build: survey wheels 70.0, kept 21.0, straddling at 1.5 ms 3.75 (max 7, none on 0); named 24 of 24

No build aborted. New captures: eval/take-straddle-triple-spread-2026-11-20.jsonl.gz (30 builds, seeds 9107, 9109) and
eval/take-straddle-triple-inst-2026-11-20.jsonl.gz (36 builds).

By take, long then triple (named of 12): 1.3 ms 4 -> 4, 1.6 ms 11 -> 12, 2.0 ms 11 -> 11, 2.4 and 2.8 ms 12 -> 12.
Paired on the same 96 builds, the triple named 1 short-take build the long drill missed and lost none.

| clause | needed | got | |
| --- | --- | --- | --- |
| (a) 0 instant misadvised | 0 | 0 of 36 | held |
| (b) more 1.3-2.1 ms named than the long drill, about 29 | > 26 | 27 | held as a direction, short of the guess |
| (c) 2.4-2.8 ms all named | 24 | 24 of 24 | held |
| (d) a spread build at 7+ straddles | 1 | 1 (a 2.8 ms build, 7-0) | held |
| rule: at least 30 of 36 1.3-2.1 ms named | >= 30 | 27 | **failed** |

**Decision.** The rule failed, so the triple is not recommended. The README now says the 24-shot long drill is as far as
the survey should go: a third pass of the same twelve shots costs 12 more balls and raises the survey's feeding wait (`wait_s`, mean of the instant builds) from 294 s to 448 s for one
more named build in 36, and nothing at 1.3 ms. Nothing on the board or in `host.py` changed.

**The scaled margin.** Two of 96 triple builds reached 7 straddling wheels, the count where the scaled margin first
differs from margin 2: the 2.8 ms build above (7 for, 0 against; margin 2 already advised 2.5 ms) and an instant
build (1 for, 7 against; margin 2 already said 0). On these sets it would change no verdict.

**What this says about 1.3 ms.** More of the same balls do not reach it: 4 of 12 on both the long and the triple
drill. The straddle count per short-take build grew only 2.72 to 3.39 for 1.5x the wheels. A guess, not measured:
the triple repeats the same twelve wheel speeds, so a 1.3 ms contact that misses a revolution's edge on one pass
misses it on the next. The lever that guess points to is a different shot mix (wheel speeds chosen so a 1.3 ms contact straddles an edge), not a longer
drill. Simulated only, one lag, one tach model.
