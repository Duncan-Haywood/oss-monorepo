# garment-twonodeopt: how far is the thermostat-driven infrared-gating textile from the best possible switching schedule when the room temperature steps?

Follow-up to [`garment-twonodestep`](../garment-twonodestep) (track 6, `PROJECTS.md`), taking its next step: "an optimal switching-time oracle". Everything is a model on a CPU; no person or fabric was measured. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/garment-twonodeopt/

**Builds on.** `garment-twonodestep` (the four room-temperature steps, the skin-temperature proxy, the gate and fixed states), `garment-twonodeswitch` (the gate) and `garment-twonodeoptics` (the switchable two-node model; "ours" is this repository's design choices, "ref" those of `pythermalcomfort` 4.6.1). The gating idea is motivated by Zhang et al. (2019), cited in `garment-thermal`. It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

**Citation check.** No new source. I did not re-read Zhang et al. (2019); the actuator is a toy, not a model of any published textile.

## Method
`garment-twonodestep`'s oracle picked one open/closed state per phase (before and after the step), so switching at the step minute was built in. Here the schedule is searched exhaustively: either start state, and at most 0, 1, 2 or 3 toggles at multiples of 10 minutes in a 180 min run (instant actuation, schedule known in advance). Each schedule is scored with the same proxy as before: mean |skin temperature - 33.7 C| (not a comfort index). The best schedule with at most k toggles is compared with the best fixed state and with the gate (band 33.2-34.2 C, lag 0 and 10 min). The grid is coarse (10 min), so an optimum between grid points is missed.

## Reproduce
```bash
python3 -m pip install numpy scipy pytest
cd research/garment-twonodeopt
python3 experiments/run.py      # about 1 minute; writes experiments/results.txt
python3 -m pytest -q tests      # 4 tests
```

## Results (from `experiments/results.txt`; "ours" first, "ref" in brackets)
- **One toggle is enough here.** Allowing 2 or 3 toggles improved the score by at most 0.001 (cool to hot, "ref": 2.579 to 2.578, three toggles); in the other seven cases it is unchanged on this grid.
- **The best toggle time is not always the step.** After a step to a cooler room the optimum starts open and toggles to closed before (hot to cool: minute 80, with the step at 90) or after (hot to mild, "ours": minute 100; "ref": 90) the step. After a step to a hotter room it is closed, then open exactly at the step (minute 90).
- **The gate's gap to the optimum (lag 0, "ours" (ref))**: hot to cool 0.114 (0.077); cool to hot 0.019 (0.015); mild to hot 0.006 (0.005); hot to mild 0.057 (0.034). With 10 min lag the hot-to-mild gap is 0.177 ("ours"). So the earlier statement that the gate "tracks the oracle closely" holds after a step up (gap at most 0.02) and is weaker after a step down.
- **Against the old oracle:** the one-toggle optimum is better than `garment-twonodestep`'s per-phase oracle in hot to cool (2.741 against 2.753) and hot to mild (0.680 against 0.695, "ours"), because switching a little early or late beats switching at the step; it equals it after a step up.
- Gate bands were not tuned, and the gate sees only skin temperature, not the schedule.

## Limitations
Stylised and preliminary. One person, one clothing level, one step, constant humidity and metabolic rate. Two assumed transmittance values (0.15 closed, 0.8 open). Grid search at 10 min on a skin-temperature proxy that ignores sweat, core temperature and sensation; the optimum is only optimal for that proxy and grid. Instant actuation for the oracle. Simulated comfort is not a claim about any real garment.

## Next steps
A step in metabolic rate; a humidity trigger; tune the gate band on a training set of steps and test on others.

## Owner steps
None required. Measuring a real gating textile's range and switching time is an owner step.

## Outside dependencies (vitamins)
Python, numpy, scipy, pytest, and the `garment-twonodestep`, `garment-twonodeoptics` and `garment-twonodeswitch` code. The transmittances, body and environment parameters are assumptions from outside this project.
