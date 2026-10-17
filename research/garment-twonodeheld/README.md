# garment-twonodeheld: if a thermostat infrared-gating band is tuned on some rooms, does it still help in rooms it never saw?

Follow-up to [`garment-twonodemet`](../garment-twonodemet) (track 6, `PROJECTS.md`), taking its next step: "tune the band on training steps and test on held-out ones". Everything is a model on a CPU; no person or fabric was measured. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/garment-twonodeheld/

**Builds on.** `garment-twonodemet` (the metabolic-step scenarios, skin-temperature proxy and four-schedule oracle, reused unchanged), `garment-twonodeswitch` (hysteresis gate; closed 0.15 and open 0.8 infrared transmittance, both assumptions) and `garment-twonodeoptics` (switchable two-node model; "ours" is this repository's choices, "ref" those of `pythermalcomfort` 4.6.1). The gating idea is motivated by Zhang et al. (2019), cited in `garment-thermal`; the actuator here is a toy, not a model of that textile. It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

**Citation check.** No new source; Zhang et al. (2019) was not re-read in this run.

## Method
Gate band (low, high threshold on skin temperature, lag 0) is chosen from a grid of 54 bands (low 32.6 to 34.2 C in 0.2 steps; width 0.1, 0.2, 0.6, 1.0, 1.4, 1.8 C) by lowest mean discomfort proxy on the **training** scenarios: rooms 22, 24 and 26 C, each with a rest-to-walk (1 to 2 met) and a walk-to-rest (2 to 1 met) step at minute 90 of 180, 0.5 clo, 50% rh, 0.1 m/s. It is then scored, unchanged, on **held-out** scenarios: rooms 23 and 25 C (between the training rooms) and 20 and 28 C (outside their range). Score: mean |skin temperature - 33.7 C|, a proxy not a comfort index. References: the untuned band 33.2-34.2 C used in `garment-twonodemet`, fixed closed, fixed open, and the per-scenario four-schedule oracle. The grid search is exhaustive and deterministic; there is no randomness and no repeat.

## Reproduce
```bash
python3 -m pip install numpy scipy pytest
cd research/garment-twonodeheld
python3 experiments/run.py      # seconds; writes experiments/results.txt
python3 -m pytest -q tests      # 4 tests
```

## Results (from `experiments/results.txt`; means over the scenarios in each set)
| Choice set, policy | train | held-out between | held-out outside |
|---|---|---|---|
| ours, tuned gate (33.6-33.7 C) | 0.880 | 0.834 | 1.354 |
| ours, untuned gate (33.2-34.2 C) | 0.935 | 0.882 | 1.405 |
| ours, fixed closed / fixed open | 1.104 / 1.575 | 1.068 / 1.520 | 1.557 / 2.056 |
| ours, four-schedule oracle | 0.920 | 0.825 | 1.364 |
| ref, tuned gate (33.6-33.7 C) | 0.467 | 0.338 | 1.085 |
| ref, untuned gate | 0.523 | 0.397 | 1.099 |
| ref, fixed closed / fixed open | 0.594 / 1.220 | 0.430 / 1.167 | 1.252 / 1.768 |
| ref, four-schedule oracle | 0.515 | 0.362 | 1.085 |

- **The tuned band carries over to these held-out rooms.** It beats the untuned band and both fixed states on both held-out sets under both choice sets, by 0.01 to 0.06 C against the untuned band. Against the four-schedule oracle the tuned gate is 0.009 C worse between the training rooms and 0.010 C better outside them under "ours", and 0.024 C better and equal under "ref".
- **Both choice sets pick the same band**, a narrow one (0.1 C wide) just below the 33.7 C target. Only 4 of 54 bands (ours) and 2 of 54 (ref) are within 0.02 C of the best training mean, so the optimum is sharp.
- **The tuned gate beats the oracle on the training set** (0.880 against 0.920, ours). The oracle only picks one of four open/closed schedules, so a thermostat that switches many times can do better. This is a statement about the restricted oracle, not about a bound on any gate.
- **The narrow band chatters.** On the 8 held-out scenarios it switches 1 to 24 times in 180 min (ours: `[1, 2, 1, 2, 14, 24, 1, 1]`; ref: `[14, 18, 13, 14, 0, 0, 1, 1]`), against 0 to 2 for the untuned band. Part of its advantage comes from instant, free, wear-free switching, which a real textile would not have. A non-zero lag or an actuation cost might change which band wins; that was not run.
- **Where the gate has nothing to do, tuning changes nothing**: at 20 C ("ref") all gates and fixed closed score the same.

## Limitations
Stylised and preliminary. One person, one clothing level, one activity step per scenario, constant room and humidity, zero actuation lag and cost, two assumed transmittances. Only 6 training and 8 held-out scenarios, all from one model family and one proxy score, so the held-out rooms are close relatives of the training ones (a different person, clothing level or humidity was not tried). The grid is coarse (0.2 C steps), the optimum is sharp, and tuning picked the narrowest width allowed after the grid was widened once from 0.2 to 0.1 C, so a still narrower band might score slightly better. The skin-temperature proxy ignores sweat, core temperature and sensation. Simulated comfort is not a claim about any real garment.

## Next steps
Retune with an actuation lag of 5 to 10 min and a penalty per switch; a proportional (not on/off) transmittance; held-out persons and clothing levels; a gate on core temperature or sweat rate; a humidity trigger.

## Owner steps
None required. Measuring a real gating textile's range, lag and switching life is an owner step.

## Outside dependencies (vitamins)
Python, numpy, scipy, pytest, and the `garment-twonodemet`, `garment-twonodeoptics` and `garment-twonodeswitch` code. Transmittances, body and environment parameters are assumptions from outside this project.
