# garment-twonodestep: when the room temperature steps, does a thermostat-driven infrared-gating textile beat its fixed states and approach an oracle?

Follow-up to [`garment-twonodeswitch`](../garment-twonodeswitch) (track 6, `PROJECTS.md`), taking its next step: "add a time-varying environment (a step in room temperature) so the gate has something to react to, then compare gate, best fixed state and an oracle." Everything is a model on a CPU; no person or fabric was measured. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/garment-twonodestep/

**Builds on.** `garment-twonodeswitch` (the hysteresis-plus-lag gate; closed 0.15 and open 0.8 infrared transmittance, both assumptions) and `garment-twonodeoptics` (the switchable two-node model; "ours" is this repository's design choices, "ref" those of `pythermalcomfort` 4.6.1). The gating idea is motivated by Zhang et al. (2019), cited in `garment-thermal`. It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

**Citation check.** No new source. I did not re-read Zhang et al. (2019); the actuator is a toy, not a model of any published textile.

## Method
`garment-twonodeoptics`' `flex.run` gained an optional `env(minute)` callback returning the air temperature for that minute (radiant temperature follows it; relative humidity stays 50%). Without it the model is unchanged (the existing tests of the three projects pass, and a test here checks that a constant `env` equals the constant-room run to 1e-9). The person is the one in `garment-twonodeswitch` (1.2 met, 0.5 clo, 0.1 m/s), 180 min, with one step at minute 90: 31 to 16 C, 16 to 31 C, 24 to 31 C, or 31 to 24 C. Compared: fixed closed, fixed open, three gate settings (band 33.2-34.2 C lag 0 and 10 min, band 33.0-34.0 C lag 0, all on skin temperature), and an oracle that knows the schedule and picks the best of the four open/closed-per-phase schedules (no lag). The score is a proxy, not a comfort index: mean |skin temperature - 33.7 C| over the 180 minutes (33.7 C is the model's neutral skin temperature). One score, no sweat or core-temperature term.

## Reproduce
```bash
python3 -m pip install numpy scipy pytest
cd research/garment-twonodestep
python3 experiments/run.py      # seconds; writes experiments/results.txt
python3 -m pytest -q tests      # 4 tests
```

## Results (from `experiments/results.txt`; "ours" first, "ref" in brackets)
- **When the step is to a hotter room the gate beats both fixed states and sits close to the oracle.** Cool to hot: gate 3.259 (2.594) vs best fixed 3.326 (2.639) vs oracle 3.240 (2.579). Mild to hot: 0.696 (0.553) vs 0.797 (0.637) vs 0.690 (0.548).
- **When the step is to a cooler room the gate gains little.** Hot to cool: 2.855 (2.141) vs fixed closed 2.829 (2.144) vs oracle 2.753 (2.067): essentially the closed state, as the skin is far below the band afterwards and the gate stays closed.
- **Actuation lag costs most after a step down.** Hot to mild with a 10 min lag: 0.857 (0.662) against fixed closed 0.817 (0.637), i.e. worse than not switching under "ours" (and about 0.025 worse under "ref"); without lag 0.737 (0.576) beats fixed closed. In the other three scenarios 10 min of lag costs at most 0.185 (hot to cool, "ours").
- **The oracle gap is small but not zero** (0.005 to 0.10 for the lag-free band 33.2-34.2 gate), and its choice is always "open while hot, closed while cool". Both choice sets agree on every ranking above; they differ in level by up to about 0.7.
- The oracle chooses per phase from a closed/open pair, so it is not an optimum over all switching times. Gate bands were not tuned.

## Limitations
Stylised and preliminary. One person, one clothing level, one step, constant humidity and metabolic rate. Two assumed transmittance values. The skin-temperature proxy ignores sweat, core temperature and thermal sensation. No actuation energy, material hysteresis or humidity trigger. The step in `garment-twonodeoptics` is a code change to a shared model (one optional argument). Simulated comfort is not a claim about any real garment.

## Next steps
A step in metabolic rate; a humidity trigger; an optimal switching-time oracle; tune the band on a training set of steps and test on others.

## Owner steps
None required. Measuring a real gating textile's range and switching time is an owner step.

## Outside dependencies (vitamins)
Python, numpy, scipy, pytest, and the `garment-twonodeoptics` and `garment-twonodeswitch` code. The transmittances, body and environment parameters are assumptions from outside this project.
