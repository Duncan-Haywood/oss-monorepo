# garment-twonodecheck

Follow-up to [`garment-thermal`](../garment-thermal) (track 6, `PROJECTS.md`), taking the next step "check the two-node constants against ... `pythermalcomfort`'s two-node output". That project's two-node model used control constants written from memory and was labelled qualitative. Here its `two_node` function (copied unchanged into `src/`, so this project stays self-contained) is run against the open-source `pythermalcomfort` implementation of the Gagge two-node model over a grid of conditions. Everything is a model on a CPU; no person was measured. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/garment-twonodecheck/

**Builds on.** `research/garment-thermal` in this repository, and the `pythermalcomfort` package (MIT; version 4.6.1 here), whose `two_nodes_gagge` documents itself as the model of Gagge et al. (1986). I did not read Gagge et al. (1986) and make no claim about what it contains. This is a comparison of two implementations, not a validation against people or against the original paper. It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

**Citation check.** The only source is the `pythermalcomfort` package, which I installed and ran; its docstring names Gagge et al. (1986) and I did not look that paper up (no access to doi.org). No other citation is used.

## Method
`experiments/run.py` runs both models for 108 combinations: air = radiant temperature 18, 24, 30, 36 C; relative humidity 30, 60, 80%; metabolic rate 1.0, 1.5, 2.0 met; insulation 0.3, 0.7, 1.0 clo; air speed 0.1 m/s; no external work. The reference code simulates 60 minutes at one-minute steps (`length_time_simulation = 60` in its source), so ours is run for 60 minutes too. Our moisture permeability index is set to 0.45 to match the reference's default as best I know (I did not check how the reference uses it). Body size: ours is 70 kg and 1.7 m (area about 1.81 m2); the reference uses its default area of 1.8258 m2. These are not identical, and this alone can account for some of the differences below. All other constants are left as each code has them.

## Reproduce
```bash
python3 -m pip install numpy scipy pytest pythermalcomfort
python3 experiments/run.py      # writes experiments/results.txt
python3 -m pytest -q
```

## Results (from `experiments/results.txt`; difference = ours minus reference)
| Quantity | mean | mean abs | min | max |
|---|---|---|---|---|
| core temperature (C) | -0.038 | 0.040 | -0.251 | +0.035 |
| skin temperature (C) | +0.213 | 0.581 | -2.125 | +1.568 |
| skin wettedness | +0.048 | 0.073 | -0.156 | +0.291 |
| evaporative loss (W/m2) | +0.371 | 2.146 | -4.750 | +14.282 |
| dry loss (W/m2) | -0.226 | 1.564 | -6.496 | +3.338 |

- Core temperature agrees within 0.25 C everywhere. Skin temperature differs by 0.58 C on average and by up to 2.1 C, the largest gaps being in the cool conditions (mean abs 1.0 C at 18 C air, 0.3 C at 36 C).
- Evaporative loss differs most in hot, humid air (mean abs 4.8 W/m2 at 36 C), with a single worst case of +14.3 W/m2 (36 C, 80% rh, 1.0 met, 0.3 clo; reference 41.6 W/m2).
- The sign of the skin-temperature change when insulation goes from 0.3 to 1.0 clo, or humidity from 30 to 80%, agrees in 23 of 24 cases.
- Run length: mean abs core gap is 0.093, 0.040 and 0.070 C at 30, 60 and 120 minutes; skin gap 0.50, 0.58, 0.66 C.

The earlier README's conclusions (infrared-transparent cloth lowers skin temperature by about 0.1 C and sweat loss by 25 g; vapour permeability matters more in hot humid air) are differences between fabrics inside one model. This comparison suggests core temperature is reproduced closely, while absolute skin temperature and sweat loss in `garment-thermal` should be read as good to roughly a degree and a few W/m2, not better. It does not test the optical extension, which the reference has no counterpart for.

## Limitations
- This compares two implementations, not either one against measurements. Agreement does not show either is right, and the reference is not a ground truth.
- I did not trace the cause of the skin-temperature gap; candidates are the body-area difference, differing control constants, how the reference treats clothing and posture (it has a `position` argument, left at its default "standing"), and numerical-step details. Not tested.
- One air speed, ta = tr, no solar load, no work, no optics, 108 grid points, no uncertainty beyond the grid spread.
- The sign check (E) is coarse: it compares only the direction of two changes.

## Next steps
Align the body area and constants one at a time to attribute the skin-temperature gap; read Gagge et al. (1986) and the reference's source to find which constants differ; add air speed and radiant-only cases; compare with a published measurement table.

## Owner steps
None required.

## Outside dependencies (vitamins)
Python, numpy, scipy, pytest, and `pythermalcomfort` (used as the reference; the tests skip if it is missing). The two-node constants of both codes come from outside this project.

## References
- `pythermalcomfort` 4.6.1 (MIT), https://pypi.org/project/pythermalcomfort/ (installed and run; version recorded in `results.txt`).
- `research/garment-thermal` in this repository (the model compared; its README lists its own sources).
- Gagge et al. (1986), named in the `pythermalcomfort` docstring; not read or re-checked here.
