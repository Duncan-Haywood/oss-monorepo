# Short takes on a second held-out set: the nine-point grid ships (2026-11-19)

Script: `tests/take_short_blind.py` (PART 3; prediction and rule committed in 7348979a6 before set N was captured).
Simulated only.

## Why a second set

On set M (`take-short-2026-11-19.md`) the candidate grid 0, 1.5, 2.5, 3-8 ms beat the shipped 0, 2-8 ms on every
measure but one: an instant build read 0.80 ms where the shipped grid read 0. That build's share was 0.99, so the Pi
would not have told anyone to re-flash, but M's rule was written on reads and the candidate failed it. Rewriting the
clause after seeing M would be a change of rule, so the candidate went to a fresh set with the instant clause written
on what the Pi does (advice) before capture. Two held-out sets was its budget: a fail here would have retired it.

## Set N

Wheel lag 0.62 s, seed 101 (neither used by an earlier take capture). Takes stratified under 3 ms at points M did not
use (0.2, 0.6, 1.0, 1.4, 1.9, 2.3, 2.75 ms), 3.3, 4.6 and 7.4 ms as checks, and the instant build; two tachs, three
launchers: 66 drills, none aborted, 22 wheels each, no survey cut.

Rule: at least 4 more builds within 0.5 ms, no more off by more than 1 ms, no more instant builds advised (share at
most 0.6), no fewer checks within 0.5 ms.

| offline refits of the capture (the rule) | shipped 0, 2-8 ms | candidate 0, 1.5, 2.5, 3-8 ms |
| --- | --- | --- |
| within 0.5 ms | 40 of 66 | 45 of 66 |
| off by more than 1 ms | 6 | 6 |
| mean absolute error | 0.517 ms | 0.468 ms |
| instant builds advised | 0 | 0 |
| instant builds read more than 0.5 ms off 0 | 0 | 0 |
| checks (3.3-7.4 ms) within 0.5 ms | 16 | 16 |
| builds advised | 27 | 27 |

Every clause held: **`TAKE_SURVEY_GRID_US` is now 0, 1.5, 2.5, 3, 4, 5, 6, 7, 8 ms.** The written prediction said
"fewer" large misses and got the same number (6 each), so half of it failed; the rule asked for "no more" and held.

## The same set on the board with the new grid

Set N captured again with the nine-point grid live on the simulated board (the board's own verdicts, not offline
refits; `take-short-n-live9-2026-11-19.jsonl.gz`, scored by `--live`, `take-short-n-live-2026-11-19.txt`). This was
not part of the rule; it checks the change end to end.

| board's own verdicts | eight-point board | nine-point board |
| --- | --- | --- |
| within 0.5 ms | 39 of 66 | 49 of 66 |
| off by more than 1 ms | 7 | 3 |
| mean absolute error | 0.532 ms | 0.441 ms |
| instant builds advised / read off 0 | 0 / 0 | 0 / 0 |
| checks within 0.5 ms | 16 | 17 |
| builds advised | 27 | 24 |
| balls held for the surveys, a drill | 127.3 s | 140.4 s |

## The cost

One more refit a surveyed wheel. With the Pi's per-ball cap at 12 s (`host.TAKE_WAIT_S`) the unit test's calibration
drill cut its surveys short (3 wheels summed, not 4 or more), so the cap is now 14 s, the same margin over the longer
survey. On set N the Pi held its balls 140.4 s a drill against 127.3 s (+10%) and no survey was cut. The TAKE_SURVEY
frame is 26 bytes, not 24; the Pi still reads the eight- and both seven-candidate frames of older firmware.

## Not known

All simulated, one seed for the rule. Whether real ball contacts fall under 3 ms at all is unmeasured. The builds still
off by more than 1 ms are 1.4-1.9 ms takes reading 0, where the summed curve's shelf hides the valley.

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_survey_pick.py --capture n.jsonl --lag 0.62 --seed 101 --takes "0.2,0.6,1.0,1.4,1.9,2.3,2.75,3.3,4.6,7.4,0"
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_short_blind.py --dense dense-n.jsonl.gz n.jsonl
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_short_blind.py --compare eval/take-dense-n-2026-11-19.jsonl.gz "0,2,3,4,5,6,7,8" "0,1.5,2.5,3,4,5,6,7,8" --rule advice
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_short_blind.py --live eval/take-short-n-2026-11-19.jsonl.gz eval/take-short-n-live9-2026-11-19.jsonl.gz
