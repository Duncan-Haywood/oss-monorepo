# The take survey's rms in tenths of a ppm (2026-11-19, firmware/esp32/README.md, same title)

Item from `portfolio/flagships.yaml` (open-tennis-robots `buildable:`): "TAKE_SURVEY rms in 0.1 ppm (a new frame length,
protocol.OLDER_FORMATS keeps the old), which removes the guard's cause".

## Change

- `src/tennisbots/protocol.py`: TAKE_SURVEY payload `<BHHH` + 9 x `H` + `BB`. The last byte is the rms units per ppm
  (`TAKE_SURVEY_TENTHS` = 10, or 1). The nine-candidate frame without it heads `OLDER_FORMATS`.
- `firmware/esp32/controller.py`: `ResidualSurvey.report(unit_us, per_ppm=1)`; `LaunchCheck.take_report` sends tenths
  and falls back to whole ppm when any slot would reach 65535. `firmware/esp32/main.py` passes the scale through.
- `src/tennisbots/host.py`: `FeederLink` reads the byte into `rms_step_ppm`; `take_share_bound(rms, step)` uses
  +-step/2; the advice names the step.
- Tests: `tests/test_host.py` `TakeSurveyTest` (`test_tenths_frame_reads`, `test_tenths_lift_the_rounding_guard`,
  `test_board_sends_tenths_and_falls_back_to_whole_ppm`; the older-frame tests now index `OLDER_FORMATS` one later).

## Measurement

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_share_tenths.py eval/*.jsonl.gz > eval/take-share-tenths-2026-11-19.txt

41 files with survey rows, 2,964 drills, 2,310 nonzero picks. Verdicts unlike the exact share: whole ppm with guard G
6, tenths 1. Spread takes named within 1 ms and advised: exact 1,553, whole 1,547, tenths 1,552 of 2,394. Instant
builds advised: 0, 0, 0 of 570. The six withheld builds and their bounds are listed in the .txt.

This was not pre-registered: it is a protocol change with no tuning parameter, and the measurement only counts
arithmetic on stored rows. No threshold was chosen from it.
