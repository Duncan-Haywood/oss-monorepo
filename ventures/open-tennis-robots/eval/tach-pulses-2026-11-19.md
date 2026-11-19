# More tach pulses a revolution: tested, closed by its pre-registered rule (2026-11-19)

Script: `tests/tach_pulses_sweep.py` (prediction and rule committed in 225c6308a before the main run; one clause, (d),
was added before that commit, after a three-ball look at the curves, and says so). Rows:
`eval/tach-pulses-main-2026-11-19.jsonl.gz`; report: `eval/tach-pulses-main-2026-11-19.txt`. Simulated only.

## The item

NEXT.md, "Buildable here": with one magnet a revolution, a take shorter than a revolution moves a wheel's fit only
when the contact straddles an edge (`eval/take-shelf-trace-2026-11-19.txt`), so most balls of a 1-2.5 ms take carry
nothing about it. Two or four magnets put an edge every half or quarter revolution. Would that multiply the balls that
see a short take enough to build it into the board path?

## What was built to ask

- `controller.drop_from_commands_steps(..., per=N, angles=...)`: the board's drop fit on N periods a revolution. The
  spans stay the real times; each period's mean speed is its share of a revolution over its time; `pre`, `after`, the
  anchor's search and the ball's window stay counted in revolutions. `per=1` is byte-for-byte the old fit
  (`tests/test_tach_pulses.py`).
- `controller.magnet_spacing(periods, N)`: each magnet's share of a revolution, each period taken over the mean of the
  revolution ending with it and the one starting with it, which is exact on a linear change of speed. A first version
  (whole revolutions from magnet 0) left about 50 ppm of misfit on a wheel still settling; this one 9-14 ppm.
- The sweep: one wheel, a first-order plant in 0.1 ms steps, the firmware's WheelLoop every 10 ms on a
  once-a-revolution PeriodTach (so the control is identical whatever is fitted), a half-sine take of 8% of the speed,
  and four magnets at k/4 of a revolution plus a 0.5 degree normal placement error, edge times floored to 1/8 us (the
  capture tach). The same ball is refitted with 1, 2 and 4 magnets at every candidate 0-8 ms by 0.5, at the take
  survey's depth and window (TAKE_SURVEY_LEVELS, TAKE_SURVEY_AFTER, tau refined). 256 balls: 2,000 / 3,500 / 5,000 /
  6,500 rpm, wheel lags 0.3 / 0.6 s, takes 0, 1, 1.5, 2, 2.5, 3, 4, 6 ms, four phases each.

## Prediction and rule (as committed)

(a) On 1-2.5 ms takes four magnets "see" (the fit at the true take beats the step's squared rms by 20%) at least
twice as many balls as one. (b) On instant balls four magnets put the ball's least more than 0.5 ms off 0 no more
often than one. (c) Naive spacing (1/N each) is worse than learnt on (a). (d) The per-ball bound (the first candidate
over max(step x 1.02, step + 2 ppm), 8.5 ms if none) holds the true take on at least 95% of four-magnet balls and its
median on 1-2.5 ms takes is at least 2 ms below one magnet's. Rule: the board path gets more magnets next only if (b)
holds and (a) or (d) does; otherwise the item closes with these numbers.

## Result (main run: spacing 0.5 deg, no sensor jitter)

| fit | sees 1-2.5 ms | sees 3-6 ms | ball's least within 0.5 ms (takes > 0) | instant least > 0.5 ms | drop error at the step / at the true take | per-ball bound holds | bound median, 1-2.5 ms |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 magnet | 38 of 128 | 24 of 96 | 51 of 224 | 16 of 32 | 0.11% / 0.03% | 163 of 256 | 2.5 ms |
| 2 learnt | 39 | 41 | 79 | 11 | 0.24% / 0.04% | 185 | 2.5 ms |
| 2 naive | 2 | 8 | 18 | 23 | 0.49% / 0.27% | 247 | 8.5 ms |
| 4 learnt | 46 | 65 | 116 | 7 | 0.55% / 0.06% | 207 | 2.5 ms |
| 4 naive | 1 | 1 | 27 | 22 | 1.79% / 1.54% | 255 | 7.5 ms |

- (a) **failed**: 46 against 38, not 76.
- (b) held: 7 against 16.
- (c) held: naive four magnets saw 1 ball against 46. Uneven magnets must be learnt; a 0.5 degree error alone is
  1,500-3,200 ppm of misfit, two orders over the take's signal.
- (d) **failed**: the bound held on 207 of 256 (81%) and its median on 1-2.5 ms takes stayed 2.5 ms.

**By the rule the item closes.** The board path keeps one pulse a revolution; nothing on the board changed.

## What the run showed that the rule did not ask

These were not pre-registered and are reported, not judged.

- Four magnets help the longer takes and the ball's own least far more than the short takes: 3-6 ms takes seen 65
  of 96 against 24, the ball's least within 0.5 ms 116 of 224 against 51, growing with speed (2,000 rpm 17 against
  11 of 56; 6,500 rpm 41 against 17).
- **A cost the item did not name: the step's drop gets worse.** Read at TAKE_US = 0, the drop's mean error went from
  0.11% to 0.55% with four magnets, 1.12% at 6,500 rpm (0.20% with one). Short periods resolve the take's shape, so
  the instant-take model misfits more. At the true take it is 0.06% against 0.03%. More magnets would need the take
  surveyed before every drill, not as an option.
- Summed as a survey (`--survey`: each take and wheel lag's 16 balls as one survey, the board's parabola on the
  dense grid): one magnet picked within 0.5 ms on 12 of 14 surveys and moved both instant surveys off 0; two and four
  learnt magnets 14 of 14 and neither instant survey. Sixteen surveys is too few to judge, and they share balls with
  the per-ball numbers above.

## Robustness (not judged)

ROBUSTNESS_PLACEHOLDER

## Not known

All simulated: a first-order wheel, an assumed half-sine take, point magnets (a real Hall edge has a width and a
hysteresis that move with speed, which would put a speed-dependent error in every share). The per-ball "sees" test
is the one `take_shelf_bound` used; the board decides on a survey summed over about 22 wheels, which this run did not
emulate beyond the exploratory 16-group sum. Reopening the item needs a fresh, pre-registered test on the survey-level
measure and a plan for the step's drop error.

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/tach_pulses_sweep.py --out rows.jsonl               # 256 balls, ~30 min on 4 cores
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/tach_pulses_sweep.py --report rows.jsonl --survey
