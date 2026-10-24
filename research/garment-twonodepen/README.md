# garment-twonodepen: at what switching penalty does a proportional infrared gate beat the on/off thermostat gate?

Follow-up to [`garment-twonodeprop`](../garment-twonodeprop) (track 6, `PROJECTS.md`), taking the first item of its next steps: "give the on/off gate a switch penalty again and look for the penalty at which proportional wins". Everything is a model on a CPU; no person or fabric was measured. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/garment-twonodepen/

**Builds on.** `garment-twonodeprop` (proportional ramp gate, 72-band grid, train/held-out protocol), `garment-twonodelag` (rooms, 54-band on/off grid, lags of 0, 2, 5 and 10 min) and, through them, `garment-twonodeheld`, `garment-twonodemet`, `garment-twonodeswitch` and `garment-twonodeoptics`, including the "ours" and "ref" choice sets. The gating idea is motivated by Zhang et al. (2019), cited in `garment-thermal`; the actuators here are toys, not models of that textile. It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

**Citation check.** No new source; Zhang et al. (2019) was not re-read in this run.

## Method
Cost = discomfort proxy (mean |skin temperature - 33.7 C| over 180 min, a proxy, not a comfort index) + penalty x swings. Swings put the two gates in the same units: for the on/off gate it is the count of full state changes; for the proportional gate it is the total variation of transmittance divided by (0.8 - 0.15), so one full close-to-open swing is 1 for either gate. The penalty (C per swing per 180 min: 0, 0.003, 0.01, 0.03, 0.1) is an assumption standing in for actuator wear or energy, not a measured value. For each lag, penalty and choice set, the best on/off band (54) and proportional band (72) are chosen by lowest mean cost on the training rooms (22, 24, 26 C, rest-to-walk and walk-to-rest steps), then scored unchanged on held-out rooms 23 and 25 C ("between") and 20 and 28 C ("outside"). Exhaustive and deterministic.

## Reproduce
```bash
python3 -m pip install numpy scipy pytest
cd research/garment-twonodepen
python3 experiments/run.py      # about 90 s; writes experiments/results.txt
python3 experiments/figure.py   # writes experiments/penalty_gain.svg
python3 -m pytest -q tests      # 5 tests
```

## Results (from `experiments/results.txt`; cost in C including the penalty term, lower is better)
Proportional minus on/off, averaged over the eight (choice set, lag) cases at each penalty; "wins" counts cases where proportional is lower (of 8):

| penalty per swing | between: wins | between: mean difference | outside: wins | outside: mean difference |
|---|---|---|---|---|
| 0 | 4 | +0.000 | 0 | +0.003 |
| 0.003 | 6 | -0.007 | 4 | -0.006 |
| 0.01 | 7 | -0.019 | 7 | -0.016 |
| 0.03 | 7 | -0.025 | 6 | -0.008 |
| 0.1 | 8 | -0.052 | 2 | +0.006 |

- **A penalty does open a gap, but a small one.** Proportional is lower in 52 of 80 cells overall. Its edge is largest at lag 5 and 10 min in the "ours" set (up to 0.071 C between, 0.065 C outside, at the highest penalty); the largest single difference in the whole table is 0.096 C ("ref", lag 2 min, penalty 0.1, between rooms). For scale, the unpenalised discomfort proxy is 0.3 to 1.5 C.
- **The benefit is not uniform.** At the highest penalty the gain holds in the "between" rooms (8 of 8) but mostly reverses in the "outside" rooms (2 of 8), where the tuned proportional band, chosen on 22 to 26 C training rooms, is not the best trade at 20 and 28 C. The crossover penalty therefore depends on the held-out set and the lag; about 0.003 to 0.01 C per swing is where the sign first becomes mostly negative in these runs.
- **Why (hypothesis, not tested here):** the on/off gate pays a full swing for each state change and learns wider bands, which costs comfort; the proportional gate can hold a mid transmittance, so the same band pays less wear. This run did not separate that explanation from others.
- Figure: `experiments/penalty_gain.svg` (lags 5 and 10 min, "ours", between rooms).

## Limitations
Stylised and preliminary. One person, one clothing level, constant humidity, two assumed transmittances, a hand-chosen penalty scale and an equal-units wear count that is itself an assumption (real wear may depend on rate or dwell, not total variation), six training and eight held-out scenarios that are close relatives. The proportional law is a linear ramp. Differences are tenths of a degree on a proxy; nothing here shows a real garment would feel different. Simulated comfort is not a claim about any real garment.

## Next steps
A PI law and a minimum dwell time; a wear model that depends on rate; held-out persons and clothing levels; retune on a wider set of rooms to see whether the "outside" reversal is a training-set artefact.

## Owner steps
None required. Measuring a real gating textile's range, lag and switching life, which would set the penalty, is an owner step.

## Outside dependencies (vitamins)
Python, numpy, scipy, pytest, and the `garment-twonodeprop` and `garment-twonodelag` code and what they reuse. Transmittances, lags, penalties, body and environment parameters are assumptions from outside this project.
