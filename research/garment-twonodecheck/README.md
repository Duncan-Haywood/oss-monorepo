# How far is the repository's two-node thermal model from an open-source implementation of the Gagge model?

Follow-up to [`garment-thermal`](../garment-thermal) (track 6, `PROJECTS.md`), taking the next step "check the two-node constants against ... `pythermalcomfort`'s two-node output". That project's two-node model used control constants written from memory and was labelled qualitative. Here its `two_node` function (copied unchanged into `src/`, so this project stays self-contained) is run against the open-source `pythermalcomfort` implementation of the Gagge two-node model over a grid of conditions. Everything is a model on a CPU; no person was measured. Produced with AI assistance (Claude).

**Live page:** https://marisstella.app/research/garment-twonodecheck/

**Builds on.** `research/garment-thermal` in this repository, and the `pythermalcomfort` package (MIT; version 4.6.1 here), whose `two_nodes_gagge` documents itself as the model of Gagge et al. (1986). I did not read Gagge et al. (1986) and make no claim about what it contains. This is a comparison of two implementations, not a validation against people or against the original paper. It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

**Citation check.** The only source is the `pythermalcomfort` package, which I installed and ran; its docstring names Gagge et al. (1986) and I did not look that paper up (no access to doi.org). No other citation is used.

## Method
`experiments/run.py` runs both models for 108 combinations: air = radiant temperature 18, 24, 30, 36 C; relative humidity 30, 60, 80%; metabolic rate 1.0, 1.5, 2.0 met; insulation 0.3, 0.7, 1.0 clo; air speed 0.1 m/s; no external work. The reference code runs `length_time_simulation = 60`, which its loop executes as 59 one-minute steps; ours is run for 60 minutes (the one-step difference moves skin temperature by about 0.001 C). Our moisture permeability index is set to 0.45 to match the reference's default as best I know (I did not check how the reference uses it). Body size: ours is 70 kg and 1.7 m (area about 1.81 m2); the reference uses its default area of 1.8258 m2. These are not identical, but aligning the area changes the mean skin gap by under 0.01 C (0.581 to 0.582), so it does not explain the differences below. All other constants are left as each code has them.

## Reproduce
```bash
python3 -m pip install numpy scipy pytest pythermalcomfort==4.6.1   # results.txt was produced with 4.6.1
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

The earlier README's conclusions (infrared-transparent cloth lowers skin temperature by about 0.1 C and sweat loss by 25 g; vapour permeability matters more in hot humid air) are differences between fabrics inside one model. This comparison suggests core temperature is reproduced closely, while absolute skin temperature and sweat loss in `garment-thermal` should be read as good to roughly a degree and a few W/m2 on average, with worst cases of 2.1 C (skin) and 14 W/m2 (evaporative loss). It does not test the optical extension, which the reference has no counterpart for.

## Limitations
- This compares two implementations, not either one against measurements. Agreement does not show either is right, and the reference is not a ground truth.
- Cause of the gaps (traced in the 2026-11-12 quality audit, [`portfolio/quality/audits/2026-11-12-garment-twonodecheck.json`](../../portfolio/quality/audits/2026-11-12-garment-twonodecheck.json)): mostly differing constants, not method. The reference caps skin wettedness for clothed people at 0.708 where `two_node` caps it at 1.0 (`model.py`, the wettedness `min`); applying the cap cuts the worst evaporative-loss gap from +14.28 to about +3.66 W/m2. The reference uses a vasodilation constant of 120 where ours uses 200; switching cuts the mean skin-temperature gap from 0.581 to 0.436 C. The reference also varies the skin-mass fraction with blood flow (ours is fixed at 0.1) and uses different convection and clothing-area formulas. So the accuracy statement above mixes constant choices with method.
- The tests check only loose agreement (core within 0.3 C, skin within 2.5 C) on a few points; 5 of 6 constants seeded wrong in the audit left them green. Without pythermalcomfort installed every test is skipped. Prior validation of the Gagge model against measured data (and the pythermalcomfort paper, Tartarini and Schiavon 2020) is not cited here.
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
