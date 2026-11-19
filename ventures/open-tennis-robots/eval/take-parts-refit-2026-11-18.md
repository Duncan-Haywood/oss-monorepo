# The take fit's four parts and its high reading (2026-11-18)

firmware/esp32/README.md, "The take fit's four parts and its high reading". Script: `tests/take_parts_refit.py`
(its docstring holds the prediction and decision rule, committed in ad4bfdc4e before the held-out rows were scored by
any model but the shipped one). Rows: the stored survey wheels of `take-survey-pick-design-rows-2026-11-18.jsonl.gz`
and `take-survey-pick-heldout-rows-2026-11-18.jsonl.gz`; drop check on `take-fit-2026-11-17.jsonl.gz`.

## Verdict

Yes: the 0.2-0.4 ms high reading is the four-part model's. With 16 parts the survey's residual least sits on the
true take (held out: 0.00 ms on both tachs, all 36 off-grid builds within 0.25 ms). Four parts stretched to the
half-sine's own variance (`spread`, the same cost a fit) read -0.07 / -0.04 ms. The pre-registered prediction held on
all clauses and the decision rule passed, so `controller.take_offsets` now stretches the half-sine's offsets
(`TAKE_MATCH_SPREAD = True`). Costs seen: on the held-out set 33 of 48 spread takes named and advised against 35 (the
rule did not count it); on the design set within 1 ms 46 of 53 against 47, and its on-grid 3 ms takes read 0.65 ms low.
The drop the board reads at the true contact time moved by 0.03 points or less for every model.

## Design set (lag 0.45 s, seed 29)

```
54 survey drills (wheel lag 0.45 s, seed 29); dense refits every 0.25 ms, 0-8 ms; kept wheels: the board's
  model 4: offsets / T = 0.230, 0.420, 0.580, 0.770; variance 0.0397 T^2 (half-sine 0.0474)
  model spread: offsets / T = 0.205, 0.412, 0.588, 0.795; variance 0.0474 T^2 (half-sine 0.0474)
  model 8: offsets / T = 0.161, 0.285, 0.378, 0.460, 0.540, 0.622, 0.715, 0.839; variance 0.0444 T^2 (half-sine 0.0474)
  model 16: offsets / T = 0.113, 0.198, 0.259, 0.310, 0.356, 0.399, 0.440, 0.480, 0.520, 0.560, 0.601, 0.644, 0.690, 0.741, 0.802, 0.887; variance 0.0463 T^2 (half-sine 0.0474)

Dense least - true take, off-grid takes (1, 2.5, 3.5, 4.5, 5.5, 7 ms): signed mean / mean absolute; within 0.25 / 0.5 ms. On-grid (3, 6 ms): signed mean
model | tach | off-grid builds | signed / abs | within 0.25 / 0.5 | on-grid signed
4 | capture 1/8 us | 18 | +0.38 / 0.38 | 12 / 16 | +0.17
4 | jittery 0.5 us | 18 | +0.78 / 0.86 | 8 / 13 | +0.05
spread | capture 1/8 us | 18 | +0.03 / 0.14 | 16 / 17 | -0.38
spread | jittery 0.5 us | 18 | +0.39 / 0.67 | 13 / 14 | -0.50
8 | capture 1/8 us | 18 | -0.04 / 0.24 | 16 / 17 | +0.04
8 | jittery 0.5 us | 18 | +0.46 / 0.57 | 13 / 15 | -0.05
16 | capture 1/8 us | 18 | +0.04 / 0.04 | 17 / 18 | +0.00
16 | jittery 0.5 us | 18 | +0.33 / 0.56 | 13 / 14 | -0.15

By take (both tachs), dense least - true, signed mean: 4 | spread | 8 | 16
  1 ms: +0.71 | +0.67 | +0.42 | +0.42
  2.5 ms: +0.42 | +0.04 | -0.38 | -0.12
  3.5 ms: +0.88 | +0.62 | +0.79 | +0.75
  4.5 ms: +0.50 | +0.12 | +0.08 | +0.00
  5.5 ms: +0.42 | -0.08 | +0.17 | +0.04
  7 ms: +0.54 | -0.12 | +0.17 | +0.04
  3 ms: -0.05 | -0.65 | -0.05 | -0.05
  6 ms: +0.25 | -0.25 | +0.04 | -0.08

The board's verdict on the shipped grid (0,2,3,4,5,6,8 ms) with each model, parabola, rounded to 0.5 ms:
  4      : within 0.5 ms 35/53, within 1 ms 47/53, named and advised 29/47, instant advised 0/6
  spread : within 0.5 ms 38/53, within 1 ms 46/53, named and advised 27/47, instant advised 0/6
  8      : within 0.5 ms 34/54, within 1 ms 47/54, named and advised 28/48, instant advised 0/6
  16     : within 0.5 ms 38/54, within 1 ms 48/54, named and advised 29/48, instant advised 0/6
```

## Held out (lag 0.6 s, seed 31)

```
54 survey drills (wheel lag 0.6 s, seed 31); dense refits every 0.25 ms, 0-8 ms; kept wheels: the board's
  model 4: offsets / T = 0.230, 0.420, 0.580, 0.770; variance 0.0397 T^2 (half-sine 0.0474)
  model spread: offsets / T = 0.205, 0.412, 0.588, 0.795; variance 0.0474 T^2 (half-sine 0.0474)
  model 8: offsets / T = 0.161, 0.285, 0.378, 0.460, 0.540, 0.622, 0.715, 0.839; variance 0.0444 T^2 (half-sine 0.0474)
  model 16: offsets / T = 0.113, 0.198, 0.259, 0.310, 0.356, 0.399, 0.440, 0.480, 0.520, 0.560, 0.601, 0.644, 0.690, 0.741, 0.802, 0.887; variance 0.0463 T^2 (half-sine 0.0474)

Dense least - true take, off-grid takes (1, 2.5, 3.5, 4.5, 5.5, 7 ms): signed mean / mean absolute; within 0.25 / 0.5 ms. On-grid (3, 6 ms): signed mean
model | tach | off-grid builds | signed / abs | within 0.25 / 0.5 | on-grid signed
4 | capture 1/8 us | 18 | +0.31 / 0.31 | 12 / 18 | +0.29
4 | jittery 0.5 us | 18 | +0.21 / 0.32 | 11 / 17 | +0.33
spread | capture 1/8 us | 18 | -0.07 / 0.07 | 18 / 18 | -0.17
spread | jittery 0.5 us | 18 | -0.04 / 0.15 | 17 / 17 | -0.08
8 | capture 1/8 us | 18 | +0.10 / 0.10 | 18 / 18 | +0.08
8 | jittery 0.5 us | 18 | +0.04 / 0.15 | 17 / 17 | +0.04
16 | capture 1/8 us | 18 | +0.00 / 0.00 | 18 / 18 | +0.00
16 | jittery 0.5 us | 18 | +0.00 / 0.06 | 18 / 18 | +0.00

By take (both tachs), dense least - true, signed mean: 4 | spread | 8 | 16
  1 ms: -0.08 | +0.17 | -0.12 | -0.04
  2.5 ms: +0.21 | -0.04 | +0.04 | +0.00
  3.5 ms: +0.25 | -0.08 | +0.12 | +0.00
  4.5 ms: +0.33 | -0.08 | +0.04 | +0.00
  5.5 ms: +0.38 | -0.08 | +0.12 | +0.00
  7 ms: +0.46 | -0.21 | +0.21 | +0.04
  3 ms: +0.25 | -0.04 | +0.00 | +0.00
  6 ms: +0.38 | -0.21 | +0.12 | +0.00

The board's verdict on the shipped grid (0,2,3,4,5,6,8 ms) with each model, parabola, rounded to 0.5 ms:
  4      : within 0.5 ms 41/54, within 1 ms 54/54, named and advised 35/48, instant advised 0/6
  spread : within 0.5 ms 46/54, within 1 ms 54/54, named and advised 33/48, instant advised 0/6
  8      : within 0.5 ms 43/54, within 1 ms 54/54, named and advised 33/48, instant advised 0/6
  16     : within 0.5 ms 43/54, within 1 ms 54/54, named and advised 33/48, instant advised 0/6
```

## Drop read by each model (tests/take_fit.py rows, wheel lag 0.3 s, seed 7)

The `4 at 6.5 ms` and `4 at 3.25 ms` rows are the shipped model at the longer contact time its own survey would name.

```
383 wheel fits at 1000 rpm and up (eval/take-fit-2026-11-17.jsonl.gz, half-sine takes); reading / true drop: mean, sd, sd at 4,500 rpm and up
  half-sine 6 ms | model 4      at 6 ms | n 190 | 0.9996 | 0.19% | 0.21%
  half-sine 6 ms | model 4      at 6.5 ms | n 190 | 1.0003 | 0.18% | 0.22%
  half-sine 6 ms | model spread at 6 ms | n 190 | 1.0006 | 0.20% | 0.21%
  half-sine 6 ms | model 8      at 6 ms | n 190 | 1.0001 | 0.18% | 0.15%
  half-sine 6 ms | model 16     at 6 ms | n 190 | 1.0000 | 0.17% | 0.16%
  half-sine 3 ms | model 4      at 3 ms | n 193 | 1.0001 | 0.17% | 0.13%
  half-sine 3 ms | model 4      at 3.25 ms | n 193 | 1.0006 | 0.17% | 0.18%
  half-sine 3 ms | model spread at 3 ms | n 193 | 1.0005 | 0.15% | 0.13%
  half-sine 3 ms | model 8      at 3 ms | n 193 | 1.0004 | 0.16% | 0.17%
  half-sine 3 ms | model 16     at 3 ms | n 193 | 1.0005 | 0.15% | 0.15%
```
