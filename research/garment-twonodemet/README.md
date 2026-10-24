# garment-twonodemet: when the metabolic rate steps (rest to walking), does a thermostat-driven infrared-gating textile beat its fixed states?

Follow-up to [`garment-twonodestep`](../garment-twonodestep) (track 6, `PROJECTS.md`), taking its next step: "a step in metabolic rate". Everything is a model on a CPU; no person or fabric was measured. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/garment-twonodemet/

**Builds on.** `garment-twonodestep` (scoring, oracle), `garment-twonodeswitch` (hysteresis-plus-lag gate; closed 0.15 and open 0.8 infrared transmittance, both assumptions) and `garment-twonodeoptics` (switchable two-node model; "ours" is this repository's choices, "ref" those of `pythermalcomfort` 4.6.1). The gating idea is motivated by Zhang et al. (2019), cited in `garment-thermal`; the actuator here is a toy, not a model of that textile. It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

**Citation check.** No new source; Zhang et al. (2019) was not re-read in this run.

## Method
`flex.run` in `garment-twonodeoptics` gained an optional `met_fn(minute)` giving the metabolic rate for that minute (core heat production and respiratory loss follow it). Without it nothing changes: a test checks a constant `met_fn` equals the plain run to 1e-9, and the existing tests of the three earlier projects still pass. Person: 0.5 clo, 50% rh, 0.1 m/s, constant room, 180 min, one step at minute 90: 1.0 to 2.0 met in 20, 24 and 28 C rooms, and 2.0 to 1.0 met at 24 C. Compared as in `garment-twonodestep`: fixed closed, fixed open, three gate settings on skin temperature, and a four-schedule oracle. Score: mean |skin temperature - 33.7 C| (a proxy, not a comfort index).

## Reproduce
```bash
python3 -m pip install numpy scipy pytest
cd research/garment-twonodemet
python3 experiments/run.py      # seconds; writes experiments/results.txt
python3 -m pytest -q tests      # 5 tests
```

## Results (from `experiments/results.txt`; "ours" first, "ref" in brackets)
- **In the 20 C room the gate never opens and equals fixed closed** (2.307 (1.876)); open is much worse (3.807 (3.282)).
- **In the 24 C room the choice sets disagree.** Rest to walk: under "ours" the gate (0.900) beats both fixed states (closed 1.133, open 1.677) and is near the oracle (0.893); under "ref" the skin never leaves the band, so the gate equals fixed closed (0.476), also the oracle.
- **In the 28 C room fixed open is about as good as any policy.** "ours": open 0.670 = oracle, gate 0.824 (band 33.2-34.2) or 0.687 (band 33.0-34.0); closed 1.042. The gate is worse than just staying open, plausibly because it is closed for part of the rest phase (open fraction 0.64).
- **Walk to rest at 24 C, "ours":** gate 0.833 against closed 0.978, but the oracle (open while walking, then closed) reaches 0.704; a 10 min lag erases most of the gate's gain (0.974). Under "ref" the gate does nothing useful (0.348 = closed = oracle; the lower-band gate is worse, 0.489).
- Gate bands were not tuned, and the best band differs by scenario. The oracle chooses per phase from a closed/open pair, not over all switching times.

## Limitations
Stylised and preliminary. One person, one clothing level, one activity step, constant room and humidity. Two assumed transmittances. The skin-temperature proxy ignores sweat, core temperature and sensation. No actuation energy, hysteresis in the material or humidity trigger. The results depend on the choice set in several scenarios, so none should be read as a property of real gating textiles. Simulated comfort is not a claim about any real garment.

## Next steps
A humidity trigger; an optimal switching-time oracle; tune the band on training steps and test on held-out ones; a gate on core temperature or sweat rate instead of skin temperature.

## Owner steps
None required. Measuring a real gating textile's range and switching time is an owner step.

## Outside dependencies (vitamins)
Python, numpy, scipy, pytest, and the `garment-twonodeoptics` and `garment-twonodeswitch` code. Transmittances, body and environment parameters are assumptions from outside this project.
