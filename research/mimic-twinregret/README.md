# Does a digital twin that a classifier can tell apart from the real system also make a worse controller?

Track 11 (adversarial human imitation), side project: milestone 8's question ("is a twin that fools the detector more useful?") asked of a physical twin. The earlier pendulum projects (`mimic-twinc2st`, `mimic-mmd`) only ask whether a test *detects* a wrong twin; this one asks whether detection *matters* for what the twin is used for. **No LLM is used and no text is generated.** Stylised and simulated only. **Preliminary: one toy system, one task, a coarse 48-point gain grid.** Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/mimic-twinregret/

Numbers come from `experiments/results.txt` and `results.json`; the figure is `experiments/auroc_vs_regret.svg`.

- **Setup.** The "real" system is the `mimic-twinc2st` pendulum (Coulomb friction 0.3, viscous 0.1, Student-t(3) sensor noise, sd 0.02 rad) with a torque input. The task is a PD controller that sees the noisy angle, differences it for velocity, saturates at 6 and tries to bring the pendulum to rest at 0 from a start angle uniform on [-2, 2] rad. Cost is the time-averaged squared true angle plus 0.002 u². Each twin changes one thing. Gains are chosen by grid search (48 pairs) on 200 start angles *simulated on the twin*, then scored on 2,000 held-out start angles on the real system. **Regret** is that real cost minus the best real cost in the grid (the best grid point costs 0.259). Regret is averaged over 12 tuning seeds. The fidelity score is the boosted-tree C2ST AUROC from `mimic-twinc2st` (raw plus second-difference features, 800 vs 800 trajectories, 3 seeds).
- **Many detectable twins cost nothing.** Of 15 wrong twins, 6 have regret exactly 0 in all 12 seeds, though their AUROC runs from 0.58 to 0.999: a 10% and 20% Coulomb error (0.58, 0.82), doubled viscous friction (0.96), g/L −20% (0.999, paired RMSE 0.25 rad), noise sd ×0.5 (0.99) and ×0.75 (0.86). The coarse grid has a wide flat optimum, and these twins land on the same grid point as the true system.
- **Where regret appears.** No noise at all (sd 0) is the worst twin: regret 0.0099, 3.8% of the best real cost, because the controller picks the aggressive gain pair (20, 8) that a noise-free twin rewards and the noisy real sensor punishes. Doubling the noise sd gives 0.0040, ×1.5 gives 0.0021, Gaussian instead of Student-t noise of the same sd 0.0016, no Coulomb friction 0.0014, g/L +20% 0.0014. Regret therefore comes mainly from *noise-level* errors, which move the best derivative gain, and not from large trajectory errors.
- **Detection score and regret agree only loosely.** Spearman correlation across the 15 wrong twins: AUROC vs regret ρ = 0.46 (p = 0.08), paired RMSE vs regret ρ = −0.28 (p = 0.31). Neither is a usable predictor here. g/L −20% has the largest paired error of any twin (0.25 rad) and zero regret; sd ×0 has paired error 0 and the largest regret.
- **Reading.** A C2ST that rejects a twin says it differs from the real system, not that the difference matters for a downstream task. Task regret is a separate measurement. It is the useful check before trusting a twin for training, and the one the imitation game's detector lacks.

```bash
cd research/mimic-twinregret
pip install numpy scipy scikit-learn matplotlib pytest
python3 -m pytest tests                      # 9 tests
python3 experiments/run.py                   # about 8 minutes on 4 CPUs, writes experiments/results.txt and results.json
python3 experiments/figure.py                # experiments/auroc_vs_regret.svg
```

## Motivation

The portfolio's theme is simulation fidelity and sim-to-real transfer. A fidelity score is only as good as its link to what a twin is for. Track 11 treats a detector's accuracy as the fidelity score of a simulated human; milestone 8 asks whether a twin that scores better is more useful. This is that question on a system small enough to answer on a CPU, with controller regret as the "useful" measure.

## Builds on

`mimic-twinc2st` (same pendulum, noise models and C2ST; `twin.py` is adapted from it). Lopez-Paz and Oquab (2017), "Revisiting Classifier Two-Sample Tests", ICLR. Sim-to-real transfer as policy regret on the real system is the standard evaluation in the sim-to-real literature (for example Tobin et al., 2017, domain randomization); this project uses a far simpler task than any of those and makes no comparison with them. No lab's work is built on, and no lab endorses this project.

## Method

`twin.py` holds the pendulum with torque, the two noise models (variance matched), the saturating PD controller on noisy finite-difference velocity, the cost, grid tuning with common random numbers across gain pairs, the C2ST and the paired RMSE. `experiments/run.py` runs 16 twins (null, Coulomb ×5, viscous ×2, g/L ×2, Gaussian noise, noise level ×5). Tuning noise and held-out evaluation noise use separate seeded generators, so regret is not selection bias on the tuning set.

## Limitations

One system, one task, one controller family and a 48-point grid, so regret is quantised: it is zero when the twin and the real system pick the same grid point, and a finer grid or a gradient-based tuner would give small non-zero values for twins listed as 0. The mean is over 12 tuning seeds and the sd column in `results.txt` shows it is noisy for the mid-range twins, so the ordering among twins with regret below 0.002 is not reliable. The correlations rest on 15 points and are not significant at 5%. Regret depends on the task: a task that is sensitive to friction (swing-up, precise stopping, energy use) would likely rank twins differently, and this was not tested. The C2ST AUROC uses one classifier and sample size and 3 seeds. The null twin has regret 0 by construction here (same grid point every seed); it is a check that the procedure is stable, not a noise floor. Nothing here is a claim about a physical pendulum.

## Next steps

A finer or continuous gain search; a swing-up or energy-aware task where friction matters; domain randomization over the twin parameters as the regret-reducing alternative to a better single twin; use regret next to the C2ST as the fidelity score for the imitator in `mimic-loop` once model weights are reachable.

## Owner steps

None.

## Outside dependencies

numpy, scipy, scikit-learn, matplotlib (tests and figure only for the last). Produced with AI assistance (Claude). No LLM proposer was used.

MIT.
