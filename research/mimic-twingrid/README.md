# Does a wider gain grid, or a controller that uses the twin's gravity, change which wrong digital twins are costly?

Track 11 (adversarial human imitation), side project: the "Next steps" of `mimic-twinswing` named two confounds, a best pump gain sitting at the edge of its grid and a controller whose gravity constant was fixed. This removes both. **No LLM is used and no text is generated.** Stylised and simulated only. **Preliminary: one toy system, 14 twins, 8 tuning seeds.** Produced with AI assistance.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/mimic-twingrid/

Numbers come from `experiments/results.txt`, `results_fixed.json` and `results_aware.json`; the figure is `experiments/regret_fixed_vs_aware.svg`.

- **The wider grid changed little.** With ke up to 32 (126 controllers, was 90), gravity errors are still the costly twins and noise errors still cost under 0.0010. Regret of g/L +20% is 0.0357 (sd 0.046 over seeds, very uneven), g/L &minus;20% 0.0132, g/L &minus;10% 0.0042, g/L +10% 0.0014. No Coulomb friction is 0.0014 here (0.0009 before); doubled viscous friction 0.0002.
- **Using the twin's gravity made gravity errors worse, not better.** If the controller's energy estimate takes the twin's own g/L, g/L &minus;20% rises from 0.0132 to 0.177 and g/L &minus;10% from 0.0042 to 0.0232; g/L +20% falls from 0.0357 to 0.0174. The twin-tuned controller is judged on the real pendulum, where its energy target is wrong, while the fixed 9.81 happens to be the right constant. Errors in the other parameters are unaffected by construction (their g/L is 9.81 either way). This is a property of this set-up: here the "fixed" controller is told the true gravity, which a real design may not know.
- **Detectability and cost now correlate, for a reason that is mostly three twins.** Spearman over 13 wrong twins (fixed): AUROC vs regret &rho; = 0.63 (p = 0.021), paired RMSE vs regret &rho; = 0.64 (p = 0.017); with the twin-aware gravity, 0.51 (p = 0.078) and 0.40 (p = 0.181). This set has four gravity twins out of 13 (`mimic-twinswing` had two out of 15), and they are both the most detectable by paired error and the costliest. Noise-only twins at AUROC 0.99 to 1.0 stay cheap (no noise 0.0002, sd &times;0.5 0.0001), so a high AUROC alone still does not mark a twin as unfit. Not comparable with the earlier correlation, which used a different twin set.
- **Regret can be negative.** The reference is the best grid point on the real system with the true gravity; the twin-aware controller with g/L +10% scores &minus;0.0009 because a slightly larger gravity constant helped. Regret is "against that reference", not "against the optimum".

```bash
cd research/mimic-twingrid
pip install numpy scipy scikit-learn matplotlib pytest
python3 -m pytest tests                      # 8 tests
OMP_NUM_THREADS=1 python3 experiments/run.py fixed   # about 10 minutes on 4 CPUs
OMP_NUM_THREADS=1 python3 experiments/run.py aware
python3 experiments/run.py report            # writes experiments/results.txt
python3 experiments/figure.py                # experiments/regret_fixed_vs_aware.svg
```

Set `OMP_NUM_THREADS=1`: with the default thread counts, four worker processes oversubscribed the CPUs (load 20 on 4 cores) and a run took over 30 minutes without finishing.

## Motivation

A fidelity score is only useful if it tells you whether a twin is fit for its purpose. Track 11 treats a detector's accuracy as the fidelity score of a simulated human; `mimic-twinregret` and `mimic-twinswing` asked it of a physical twin. This checks that the second result was not an artefact of its grid or its fixed gravity constant.

## Builds on

`mimic-twinswing` (same pendulum, noise models, twins, controller and C2ST; `twin.py` is copied with two changes, so this project stands alone), `mimic-twinregret` and `mimic-twinc2st`. Lopez-Paz and Oquab (2017), "Revisiting Classifier Two-Sample Tests", ICLR. Energy-based swing-up is the textbook method of &Aring;str&ouml;m and Furuta (2000), "Swinging up a pendulum by energy control", *Automatica* 36; this uses a crude clipped-torque version and makes no comparison with it. No lab's work is built on, and no lab endorses this project.

## Method

`twin.py` is `mimic-twinswing`'s with `swing_cost(..., gnom)` taking the controller's gravity constant and a gain grid with ke in {1, 2, 4, 8, 12, 16, 32} (126 controllers). In `fixed` mode `gnom` = 9.81; in `aware` mode it is the twin's g/L both while tuning and when the tuned controller is run on the real system. Tuning uses 150 twin starts, scoring 600 held-out real starts with common random numbers; 8 tuning seeds; AUROC from boosted trees on raw plus second-difference features, 800 vs 800, 3 seeds.

## Limitations

One system, one controller family. The twin set differs from `mimic-twinswing`'s (14 twins, adding g/L &plusmn;10% and dropping several friction and noise levels), so correlations are not comparable. ke = 32 is now the pick for g/L +20% (the new grid edge), so the edge problem may recur for that twin. Eight seeds; regret of g/L +20% varies several-fold between seeds. In `aware` mode the true-gravity reference is not a bound, hence negative regrets. Simulated, not a real device.

## Next steps

Domain randomization over g/L as in `mimic-twinrand` on the swing-up task; a controller that estimates gravity online instead of taking it from the twin or fixing it; a power analysis as in `mimic-twinpower` for the g/L twins.

## Outside dependencies

None beyond pip packages (NumPy, SciPy, scikit-learn, Matplotlib, pytest); no data, models or services.
