# garment-twonodeswitch: what does a thermostat-driven infrared-gating textile do in the two-node model that its fixed closed and open states do not?

Follow-up to [`garment-twonodegate`](../garment-twonodegate) (track 6, `PROJECTS.md`), taking its next step: "model the switching (a skin-temperature-triggered gate with a delay) in the two-node loop and compare against the fixed-state bounds." Everything is a model on a CPU; no person or fabric was measured. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/garment-twonodeswitch/

**Builds on.** `garment-twonodegate` (fixed closed 0.15 and open 0.8 transmittance), `garment-twonodeoptics` (the switchable two-node model; "ours" is this repository's design choices, "ref" those of `pythermalcomfort` 4.6.1). The gating idea is motivated by Zhang et al. (2019), cited in `garment-thermal`. It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

**Citation check.** No new source. I did not re-read Zhang et al. (2019); the thermostat and lag are my own toy actuator, not a model of any published textile.

## Method
`garment-twonodeoptics/src/.../flex.py` gains an optional `gate(minute, tsk, tcr)` callback (and a `trace` list) that sets the textile's infrared transmittance each minute; with neither given, the model is unchanged (its tests still pass, and a test here checks the 16 C skin temperature of 27.00 C). `src/garment_twonodeswitch/switch.py` defines `Gate`: it commands "open" when skin temperature exceeds `t_hi` and "closed" when it falls below `t_lo` (hysteresis), and transmittance follows the command as a first-order lag of `lag` minutes. Person: 1.2 met, 0.5 clo, 50% rh, 0.1 m/s, radiant = air temperature, three constant rooms (31, 24, 16 C), 180 min, starting closed. Five band/lag settings, both choice sets.

## Reproduce
```bash
python3 -m pip install numpy scipy pytest
cd research/garment-twonodeswitch
python3 experiments/run.py      # seconds; writes experiments/results.txt
python3 -m pytest -q tests      # 11 tests
```

## Results (from `experiments/results.txt`)
- **Under constant conditions the gate settles into one of the two fixed states, so it adds nothing beyond the fixed bounds.** In the hot room, bands 33.0-34.0 and 33.4-33.6 end at the open state (skin 34.99 C under "ours", 34.66 C under "ref"; evaporative loss 34.1 and 37.5 W/m2), open for 94-100% of the 180 minutes. In the 16 C room the skin never rises above the band and the gate stays closed (27.00 / 27.62 C).
- **Actuation lag only delays the start**: with a 10 min lag the hot-room gate is open for 94% instead of 98% of the minutes (band 33.0-34.0), with the same end state.
- **Threshold placement matters more than lag.** Band 32.0-35.0 in the hot room opens under "ours" (skin 35.2 C closed exceeds 35) but never opens under "ref" (closed skin 34.86 C stays below 35), so the same textile gives 34.1 vs 43.1 W/m2 evaporation (end states differ by the choice set, not by the gate).
- **No chatter** in any run: at most one state change per run. In the 24 C room, band 33.4-33.6 opens for 1-2% of minutes at the start (initial skin 33.7 C) and closes as skin drops.
- This is largely a null result: a thermostat on a constant-load scenario cannot beat the best fixed state. Its value, if any, needs changing conditions (a step in room temperature or in metabolic rate), which this scenario lacks.

## Limitations
Stylised; constant rooms, one clothing level, one body, one actuator form. Transmittance 0.15 and 0.8 are assumptions. Switching energy, hysteresis in a real material, and humidity triggers are not modelled. The hook changes `garment-twonodeoptics`' API by adding two optional arguments. Simulated comfort is not a claim about any real garment.

## Next steps
Add a time-varying environment (step in room temperature or in met rate) so the gate has something to react to, then compare gate, best fixed state and an oracle; add a humidity trigger.

## Owner steps
None required. Measuring a real gating textile's transmittance range and switching time is an owner step.

## Outside dependencies (vitamins)
Python, numpy, scipy, pytest, and the `garment-twonodeoptics` model. The transmittance values and body and environment parameters are assumptions from outside this project.
