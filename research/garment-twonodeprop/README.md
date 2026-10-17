# garment-twonodeprop: does a proportional infrared-gating textile beat the on/off thermostat gate?

Follow-up to [`garment-twonodelag`](../garment-twonodelag) (track 6, `PROJECTS.md`), taking the first item of its next steps: "a proportional (not on/off) transmittance". Everything is a model on a CPU; no person or fabric was measured. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/garment-twonodeprop/

**Builds on.** `garment-twonodelag` (rooms, 54-band on/off grid, lags of 0, 2, 5 and 10 min, scoring; reused unchanged, and through it `garment-twonodeheld`, `garment-twonodemet`, `garment-twonodeswitch` and `garment-twonodeoptics`, including its "ours" and "ref" choice sets). The gating idea is motivated by Zhang et al. (2019), cited in `garment-thermal`; the actuator here is a toy, not a model of that textile. It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

**Citation check.** No new source; Zhang et al. (2019) was not re-read in this run.

## Method
The proportional gate commands a transmittance that rises linearly from 0.15 (closed) to 0.8 (open, both assumptions inherited) as skin temperature goes from `lo` to `hi`, and the textile follows with the same first-order lag as the on/off gate. A band of width `hi-lo` approaching 0 is the on/off gate without hysteresis. For each lag the band is chosen by lowest mean discomfort proxy (mean |skin temperature - 33.7 C|, a proxy, not a comfort index) on the training scenarios (rooms 22, 24, 26 C, rest-to-walk and walk-to-rest steps at minute 90 of 180), from 72 proportional bands (lower edge 32.6 to 34.2 C, width 0.1 to 3.0 C), then scored unchanged on held-out rooms 23 and 25 C ("between") and 20 and 28 C ("outside"). The comparison is the best on/off band (hysteresis, no switch penalty) from the same protocol. A second experiment forces the proportional width to be at least 0.6, 1.4 or 3.0 C to price softness. Exhaustive and deterministic.

## Reproduce
```bash
python3 -m pip install numpy scipy pytest
cd research/garment-twonodeprop
python3 experiments/run.py      # about 40 s; writes experiments/results.txt
python3 experiments/figure.py   # writes experiments/softness_cost.svg
python3 -m pytest -q tests      # 5 tests
```

## Results (from `experiments/results.txt`; discomfort proxy in C, lower is better)
Held-out "between" / "outside" cost, "ours" choice set; prop minus on/off in the last column (negative = proportional better):

| lag (min) | on/off band | on/off | proportional band | proportional | difference |
|---|---|---|---|---|---|
| 0 | 33.6-33.7 | 0.834 / 1.354 | 33.6-33.7 | 0.836 / 1.356 | +0.002 / +0.002 |
| 5 | 33.6-33.7 | 0.876 / 1.363 | 33.6-33.8 | 0.872 / 1.366 | -0.004 / +0.003 |
| 10 | 33.8-33.9 | 0.918 / 1.389 | 33.8-33.9 | 0.913 / 1.393 | -0.005 / +0.003 |

- **Negative result: no meaningful gain from proportional control.** Across both choice sets, four lags and two held-out sets, proportional beats on/off in 5 of 16 cells, and every difference is within 0.010 C. The tuned proportional bands are only 0.1 to 0.2 C wide, so the search picks something close to the on/off gate; the tuned gate keeps reaching the full 0.15-0.80 transmittance range.
- **Softness costs comfort in this model.** Forcing the band to be at least 1.4 C wide adds 0.05 to 0.07 C ("between") and 0.02 to 0.04 C ("outside"), "ours", at lag 0 and 10 min; 3.0 C wide adds up to 0.14 C. Full rows, including "ref", are in `results.txt`.
- **Why (hypothesis, not tested here):** a skin-temperature error of a few tenths of a degree already calls for nearly full actuation, so the useful gain is very high; and in this model switching has no cost (this project sets no penalty). With a per-switch cost or a wear model proportional control might help; that is the open question, not an answer from this run.

## Limitations
Stylised and preliminary. One person, one clothing level, constant room and humidity, two assumed transmittances, six training and eight held-out scenarios that are close relatives. The proportional law is a linear ramp; other laws (PI, with a derivative term) are untested. No actuator power, wear or switching cost enters the score. The grid is coarse. Simulated comfort is not a claim about any real garment.

## Next steps
Give the on/off gate a switch penalty again and look for the penalty at which proportional wins; a PI law; held-out persons and clothing levels; a minimum dwell time.

## Owner steps
None required. Measuring a real gating textile's range, lag and switching life is an owner step.

## Outside dependencies (vitamins)
Python, numpy, scipy, pytest, and the `garment-twonodelag` code and what it reuses. Transmittances, lags, body and environment parameters are assumptions from outside this project.
