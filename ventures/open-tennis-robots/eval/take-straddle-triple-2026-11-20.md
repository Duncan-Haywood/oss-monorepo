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
