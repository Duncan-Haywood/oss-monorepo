# hanger-3dradius: does a 3D-designed hanger keep improving when the end-radius cap is lifted past 6 cm?

**No. Lifting the end-radius cap from 6 cm to 10 or 15 cm does not lower the whole-sheet error: 1.08 ± 0.29 cm at a 10 cm cap and 1.21 ± 0.32 cm at 15 cm, against 1.12 ± 0.25 cm at 6 cm (8 seeds each; differences −0.04 cm, p = 0.77, and +0.08 cm, p = 0.57). The chosen radius grows with the cap (mean 8.2 and 10.6 cm) but the error has plateaued, so the earlier "optimum sits on the bound" is a flat ridge in the objective, not a missing gain.** Crease and edge sag keep falling slowly (see table), which is the only thing blunter ends still buy.

## Why this question

`hanger-3dseeds` found 3D-designed hangers beat 2D-designed ones, but three of eight wide-bound optima sat exactly on its 6 cm radius cap, and its next step was to widen the cap until the optimum stopped sitting on it. This runs that step.

## Builds on

`hanger-3dseeds` (objective, budget, seeds and the 6 cm result, imported unchanged), `hanger-3d` and `hanger-fit`. No lab tag.

## Method

M tee, arm half-depth 3 cm, 3D CMA-ES loop, 64 drapes, 4 variables, objective = whole-sheet error + 0.05 × max(0, crease − 30); seeds 0 to 7. Only the radius cap changes (`experiments/run.py`): 10 and 15 cm, other bounds as `hanger-3dseeds`' wide box (bow −2 to 5 cm). The 6 cm row is `hanger-3dseeds/experiments/results.txt`. Comparison uses `hanger3dseeds.stats.paired_summary` (bootstrap CI, exact permutation test).

## Results (`experiments/results.txt`)

| radius cap | whole-sheet error, cm | crease, deg/cm | sag, cm | chosen radius, cm | seeds at the cap |
|---|---|---|---|---|---|
| 6 (hanger-3dseeds) | 1.12 ± 0.25 | 11 | 2.9 | 4.7 to 6 | 3 of 8 |
| 10 | 1.08 ± 0.29 | 7.8 ± 3.1 | 2.18 ± 0.73 | 8.2 ± 2.4 | 3 of 8 (10.00) |
| 15 | 1.21 ± 0.32 | 8.4 ± 6.1 | 1.73 ± 0.59 | 10.6 ± 3.2 | 2 of 8 (15.00) |

- 10 cap minus 6 cap: −0.04 cm, CI [−0.30, +0.21], p = 0.77. 15 cap minus 6 cap: +0.08 cm, CI [−0.18, +0.34], p = 0.57.
- Chosen radii range from 4 to 15 cm across seeds with similar error, so many designs are near-equivalent.

## Limitations

- Whole-sheet error stops improving, but a 10 to 15 cm end radius is not a usable hanger tip; no width or contact-patch constraint is applied, and none of this is measured on a real garment.
- One garment, one arm depth, 64 drapes per loop: a longer search could separate the caps. Eight seeds detect differences of roughly 0.3 cm only.
- Assumed fabric constants, 20 cm strip, no friction (inherited from `hanger-3d`).
- Citations: none beyond those in `hanger-3d` and `hanger-fit`.

## Next steps

Add a blunt-end (contact width) penalty, repeat across garments and depths, and measure real hanger tip radii (owner step).

## Reproduce

```bash
cd research/hanger-3dradius
python3 -m unittest discover -s tests   # needs numpy
python3 experiments/run.py              # results.txt, ~50 min on 4 cores (run in the background)
```
