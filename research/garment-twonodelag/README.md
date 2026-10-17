# garment-twonodelag: does a tuned infrared-gating thermostat survive an actuation lag and a cost per switch?

Follow-up to [`garment-twonodeheld`](../garment-twonodeheld) (track 6, `PROJECTS.md`), taking the first item of its next steps: "retune with an actuation lag of 5 to 10 min and a penalty per switch". Everything is a model on a CPU; no person or fabric was measured. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/garment-twonodelag/

**Builds on.** `garment-twonodeheld` (train and held-out rooms, the 54-band grid, the tuning routine; reused unchanged), `garment-twonodemet` (metabolic-step scenarios, skin-temperature proxy), `garment-twonodeswitch` (hysteresis gate with a first-order actuation lag; closed 0.15 and open 0.8 infrared transmittance, both assumptions) and `garment-twonodeoptics` (switchable two-node model; "ours" is this repository's choices, "ref" those of `pythermalcomfort` 4.6.1). The gating idea is motivated by Zhang et al. (2019), cited in `garment-thermal`; the actuator here is a toy, not a model of that textile. It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

**Citation check.** No new source; Zhang et al. (2019) was not re-read in this run.

## Method
For each actuation lag (first-order time constant 0, 2, 5 or 10 min) and each switch penalty (0, 0.01 or 0.03 C per switch, assumed), the gate band is chosen from the same 54 bands by lowest mean **cost** on the training scenarios (rooms 22, 24, 26 C, each with a rest-to-walk and a walk-to-rest step at minute 90 of 180, 0.5 clo, 50% rh, 0.1 m/s). Cost = mean |skin temperature - 33.7 C| (a proxy, not a comfort index) plus penalty times the number of switches in the 180 min, counted from the transmittance crossing its midpoint. The tuned band is then scored unchanged on held-out rooms 23 and 25 C ("between") and 20 and 28 C ("outside"). References: the untuned band 33.2-34.2 C and fixed closed (no switches, so no penalty and no lag). The search is exhaustive and deterministic.

## Reproduce
```bash
python3 -m pip install numpy scipy pytest
cd research/garment-twonodelag
python3 experiments/run.py      # about a minute; writes experiments/results.txt
python3 -m pytest -q tests      # 5 tests
```

## Results (from `experiments/results.txt`; cost means over each set, lower is better)
Choice set "ours", tuned band and cost on train / between / outside:

| lag (min) | penalty (C/switch) | tuned band (C) | tuned | untuned 33.2-34.2 | fixed closed |
|---|---|---|---|---|---|
| 0 | 0 | 33.6-33.7 | 0.880 / 0.834 / 1.354 | 0.935 / 0.882 / 1.405 | 1.104 / 1.068 / 1.557 |
| 0 | 0.03 | 33.4-34.0 | 0.953 / 0.899 / 1.385 | 0.980 / 0.927 / 1.420 | same |
| 5 | 0 | 33.6-33.7 | 0.914 / 0.876 / 1.363 | 0.972 / 0.922 / 1.409 | same |
| 10 | 0 | 33.8-33.9 | 0.951 / 0.918 / 1.389 | 1.013 / 0.969 / 1.414 | same |
| 10 | 0.03 | 33.6-34.2 | 0.997 / 0.991 / 1.429 | 1.058 / 1.014 / 1.429 | same |

The full 12-row tables for both choice sets are in `experiments/results.txt`.

- **Lag shrinks the gate's gain over never switching.** With no penalty, the tuned gate's advantage over fixed closed on the "between" rooms falls from 0.234 C (lag 0) to 0.150 C (lag 10), under "ours"; it stays positive in every "ours" cell on both held-out sets.
- **Retuning with lag moves the band up and keeps it narrow**: 33.6-33.7 C at lag 0 and 5 min, 33.8-33.9 C at 10 min (ours, no penalty). Its edge over the untuned band on "between" rooms is about the same at lag 0 and 10 (0.048 and 0.051 C) but on "outside" rooms falls from 0.051 to 0.025 C.
- **A switch penalty widens the band and mostly removes the chatter.** At 0.03 C per switch the tuned band is 33.4-34.0 C ("ours") and, under "ours", it switches as often as the untuned band over the 8 held-out scenarios (8 against 8 at every lag). Without a penalty it switches 46 times at lag 0 (against 8), 24 at lags 2 and 5, and 16 at lag 10. Under "ref" the penalised band is 33.6-34.2 C at lags 0 to 5 (6 to 8 switches against 5), but at lag 10 it is 33.8-33.9 C and switches 17 times, which is how it ends up worse than the untuned band there (next bullet).
- **The tuned band does not always generalise.** Under "ours" it costs more than the untuned band in 1 of 24 (lag, penalty, held-out set) cells (lag 0, 0.01 C, outside, by 0.003 C). Under "ref" it does in 3 of 24 (penalty 0.03 C, "between" rooms, lags 0, 2 and 10, by 0.008, 0.005 and 0.035 C), and at lag 10 with 0.03 C per switch it costs 0.052 C more than never switching (0.482 against 0.430). Cause not isolated: a likely one is that the band is tuned on a few rooms and the optimum is sharp.
- **The two choice sets disagree** on bands and on the size of effects (at lag 10 with no penalty: 33.8-33.9 C for "ours", 33.6-33.8 C for "ref"), so neither is a measurement of a real person.

## Limitations
Stylised and preliminary. One person, one clothing level, one activity step per scenario, constant room and humidity, two assumed transmittances. The lag is a first-order time constant in the model's one-minute steps and the penalty values are assumptions, not measurements of any textile, driver electronics or wear. A switch is counted at the transmittance midpoint, so a lagged gate that turns around before reaching it is not counted. Only 6 training and 8 held-out scenarios, close relatives of each other, from one model family and one proxy score. The grid is coarse (0.2 C steps in the lower threshold) and the narrowest width is often chosen, so a narrower band might score slightly better. Simulated comfort is not a claim about any real garment.

## Next steps
A proportional (not on/off) transmittance; held-out persons and clothing levels; a gate on core temperature or sweat rate; a humidity trigger; a minimum dwell time instead of a per-switch penalty.

## Owner steps
None required. Measuring a real gating textile's range, lag and switching life is an owner step.

## Outside dependencies (vitamins)
Python, numpy, scipy, pytest, and the `garment-twonodeheld`, `garment-twonodemet`, `garment-twonodeoptics` and `garment-twonodeswitch` code. Transmittances, lags, penalties, body and environment parameters are assumptions from outside this project.
