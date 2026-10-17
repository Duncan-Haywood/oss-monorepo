# garment-twonodesteady

Follow-up to [`garment-twonodeoptics`](../garment-twonodeoptics) (track 6, `PROJECTS.md`), taking an item from its next steps: "compare optics effects at steady state." Question: do the fabric-optics effects measured after one hour (stylised) keep their size and ranking once the two-node model has stopped changing? Everything is a model on a CPU; no person or fabric was measured. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/garment-twonodesteady/

**Builds on.** `research/garment-twonodeoptics` (its switchable two-node model, in which every design choice is the repository's "ours" or that of `pythermalcomfort` 4.6.1, "ref"), and through it `garment-thermal`, `garment-twonodecheck` and `garment-twonodealign`. It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

**Citation check.** No new source. The reference implementation is `pythermalcomfort` 4.6.1 as used in `garment-twonodeoptics`; I did not read Gagge et al. (1986).

## Method
`garment-twonodeoptics`' `flex.run` gained a `minutes` argument (default 60, so the existing results are unchanged; a test checks this). Here the same scenarios and property spans as that project are run for 60 minutes and for 1440 minutes (24 h of model time, taken as steady state). Steady state is checked by running 2880 minutes as well: across every run below the largest change in skin temperature, core temperature, dry loss or evaporative loss between 1440 and 2880 minutes is 0.0007 (C or W/m2). An 8-hour run was not enough for the `ref` choices in the cool room (a change of 0.37 between 480 and 960 minutes), which is why 24 h is used.

Steady state here is only the fixed point of the model. A person would not spend 24 h at constant metabolic rate, and the model has no fatigue, acclimatisation or sweat-gland depletion, so "steady" says nothing about real long exposures.

Tests (`tests/`, 9 pass): the default duration is unchanged; the model reaches steady state in three scenarios under both choice sets; one hour is not steady in the cool room; the infrared-transmittance effect has the sign expected.

## Reproduce
```bash
python3 -m pip install numpy scipy pytest pythermalcomfort==4.6.1
python3 experiments/run.py      # writes experiments/results.txt
python3 -m pytest -q
```

## Results (from `experiments/results.txt`)
- **Three of four scenarios are already steady at one hour.** In the 28 C room, with hot walls, and in sun, the effect of every property on skin temperature, core temperature and dry loss is the same at 60 min and at steady state to within 0.01 C and 0.1 W/m2 for dry loss in the printed table; the ratio of steady to 60-minute dry-loss effect is 1.00 for every property with an effect above 0.5 W/m2. The ranking of properties is unchanged.
- **The cool room (16 C) is the exception, and it is where `garment-twonodeoptics` found the large disagreement.** Under `ours`, steady-state dry-loss effects are 10.3, -5.4 and +7.3 W/m2 for transmittance, emissivity and insulation (8.1, -5.5, 3.9 at 60 min); under `ref` they are 10.1, -4.8 and 6.6 (15.4, -12.6, 10.7 at 60 min). The property ranking by dry-loss effect differs between 60 min and steady state in this scenario under both choice sets.
- **The ref/ours disagreement shrinks at steady state in the cool room.** The ref/ours ratio of the dry-loss effect is 0.89 to 0.98 at steady state; `garment-twonodeoptics` reported 1.9 to 2.7 at one hour. So in this model that disagreement was mostly a difference in how fast the two implementations cool the skin, not in where they settle.
- **Elsewhere the ref/ours ratios are unchanged** (they are the same numbers as at 60 min): 0.49 to 1.49 in sun (transmittance halves, insulation grows), 0.85 to 1.24 with hot walls.
- Reading: for the cool room, a one-hour comparison mixes the optics effect with the speed of the transient; steady-state numbers separate them. The qualitative conclusions of `garment-thermal` about which property matters in which setting hold at steady state in these scenarios.

## Limitations
Stylised model, four scenarios, one clothing level, no body-size variation. The optical extension of the `ref` choices is my construction (no reference exists). Only dry-loss effects are tabulated beyond temperatures; sweat is not tracked. Not a validation against people.

## Next steps
Read Gagge et al. (1986) for the skin-mass-fraction and convection choices; add a published measurement table; test the infrared-gating textile bounds of `garment-thermal` section E under both choice sets and at steady state.

## Owner steps
None required.

## Outside dependencies (vitamins)
Python, numpy, scipy, pytest, `pythermalcomfort` 4.6.1 (through `garment-twonodeoptics`), and that project's model. Constants and optical property spans come from outside this project.
