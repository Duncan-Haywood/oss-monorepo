# garment-twonodegate: do the infrared-gating bounds of `garment-thermal` hold under two sets of two-node choices and at steady state?

Follow-up to [`garment-twonodesteady`](../garment-twonodesteady) (track 6, `PROJECTS.md`), taking its next step: "test the infrared-gating textile bounds of `garment-thermal` section E under both choice sets and at steady state." Question: does the effect of switching a gated textile from closed (infrared transmittance 0.15) to open (0.8), found in the first two-node model after 3 h, survive the other design choices of `pythermalcomfort` 4.6.1 and a run to steady state? Everything is a model on a CPU; no person or fabric was measured. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/garment-twonodegate/

**Builds on.** `garment-thermal` (section E: the two fixed states and their numbers), `garment-twonodeoptics` (the switchable model; every design choice is the repository's "ours" or that of `pythermalcomfort` 4.6.1, "ref"), `garment-twonodesteady` (steady-state method). The gating idea is motivated by Zhang et al. (2019), cited in `garment-thermal`. It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

**Citation check.** No new source. I did not re-read Zhang et al. (2019) or Gagge et al. here; the bounds are the toy two-state ones of `garment-thermal`, with no switching dynamics.

## Method
`src/garment_twonodegate/gate.py` calls `garment_twonodeoptics.flex.run` for a person at 1.2 met, 0.5 clo, 50% rh, 0.1 m/s, radiant temperature equal to air temperature, outer emissivity 0.95, solar absorptance 0.5 (no sun), in a 31 C room and a 16 C room, with transmittance 0.15 (closed) or 0.8 (open). Each state is run for 180 min (the horizon of `garment-thermal`) and for 1440 min (steady state; 2880 min is also run to check). Both choice sets, `ours` and `ref`, are used. The model does not track sweat mass, so the evaporative heat loss (W/m2, including diffusion through the skin) stands in for it.

## Reproduce
```bash
python3 -m pip install numpy scipy pytest
cd research/garment-twonodegate
python3 experiments/run.py      # a few seconds; writes experiments/results.txt
python3 -m pytest -q tests      # 10 tests
```

## Results (from `experiments/results.txt`)
Open minus closed (skin and core temperature in C, dry and evaporative loss in W/m2):

| room | choices | horizon | skin | core | dry | evap |
|---|---|---|---|---|---|---|
| 31 C | ours | 3 h and steady | -0.25 | -0.02 | +6.2 | -6.2 |
| 31 C | ref | 3 h and steady | -0.20 | -0.02 | +5.5 | -5.5 |
| 16 C | ours | 3 h and steady | -1.45 | -0.04 | +7.9 | -0.7 |
| 16 C | ref | 3 h | -1.46 | -0.05 | +8.2 | -0.7 |
| 16 C | ref | steady | -1.43 | -0.04 | +7.7 | -0.7 |

- Under `ours` the 3 h state of every run is already the steady state (largest change between 1440 and 2880 min is 0.0000 in the printed table). The two skin temperatures at 16 C (27.00 closed, 25.55 open) reproduce the 27.0 and 25.6 C of `garment-thermal` (a test checks this).
- Under `ref` the 31 C room is also steady at 3 h. Only the `ref` run in the 16 C room is still settling at 3 h (skin 27.62 closed, 26.15 open, against 27.15 and 25.72 at steady state), but the open-minus-closed difference moves by only 0.03 C and 0.5 W/m2.
- So the two bounds of `garment-thermal` hold in sign and size across both choice sets: opening the gate in the hot room lowers skin temperature by 0.20 to 0.25 C and moves 5.5 to 6.2 W/m2 from evaporation to dry loss; closing it in the cool room keeps the skin 1.4 to 1.5 C warmer. As a rough size check, 6.2 W/m2 over 1.81 m2 for 3 h is of the order of 50 g of evaporated water, the same order as the 43 g sweat saving in `garment-thermal` (a different bookkeeping, not a match).
- The spread between `ours` and `ref` (about 0.05 C and 0.7 W/m2 in the hot room) is small next to the gate effect itself.

## Limitations
Stylised, two rooms, one clothing level and metabolic rate, one body. The gate is two fixed states; switching threshold, speed and hysteresis are not modelled. The optical extension of the `ref` choices is my construction. Evaporative loss is not sweat mass. Neither choice set is validated against people. Simulated comfort is not a claim about any real garment.

## Next steps
Model the switching (a humidity- or skin-temperature-triggered gate with a delay) in the two-node loop and compare against the fixed-state bounds; add a published measurement of a gating textile's transmittance range.

## Owner steps
None required. Measuring a real gating textile's infrared transmittance is an owner step if the 0.15 and 0.8 values are to be grounded.

## Outside dependencies (vitamins)
Python, numpy, scipy, pytest, and the `garment-twonodeoptics` model. The transmittance values and the body and environment parameters are assumptions from outside this project.
