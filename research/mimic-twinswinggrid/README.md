# Does a finer controller grid change which wrong digital twins cost something on a swing-up task?

Track 11 (adversarial human imitation), side project: the first "Next step" of `mimic-twinswing` was to widen its 60-point gain grid, because several twins picked gains on the grid's edge and a coarse grid could hide or create regret. This is a robustness check of that result, not a new question: **if the answer is unchanged, the earlier finding stands on a firmer base.** A parallel run, `mimic-twingrid`, also widened the grid (to ke 32) but on a different twin set (14 twins, four of them gravity errors), where AUROC vs regret reached ρ = 0.63 (p = 0.021). This run holds the original 15-twin set fixed, so it separates a grid effect from a twin-set effect. **No LLM is used and no text is generated.** Stylised and simulated only. **Preliminary: one toy pendulum, one task, a 144-point grid, 12 tuning seeds.** Produced with AI assistance.

**Live page:** https://duncan-haywood.github.io/oss-monorepo/research/mimic-twinswinggrid/

Numbers come from `experiments/results.txt` and `results.json`; the figure is `experiments/auroc_vs_regret_fine.svg`.

- **Setup.** Identical to `mimic-twinswing` (same pendulum, 15 wrong twins, 150 tuning starts, 600 held-out real starts, 12 seeds) except the grid: `ke` has 8 values (0.5 to 12) instead of 5, giving 144 controllers. The best real cost is 0.3550.
- **The same two twins cost much.** g/L +20% has regret 0.0217 (6.1% of the best cost, sd 0.025 over seeds, median 0.007) and g/L −20% 0.0133 (3.8%, sd 0.002). With the coarse grid they were 0.0292 and 0.0130.
- **Everything else is at or below 0.0011 (0.3%)**: noise-sd ×2 0.0011, no Coulomb friction 0.0010, noise-sd ×0.75 0.0010 (median 0; a few seeds drive the mean), ×1.5 0.0010, Gaussian noise 0.0009; Coulomb −67% 0.00016, doubled viscous friction 0.00022. The exact twin's own regret is 0.00011.
- **Ranking is stable.** Spearman between coarse-grid and fine-grid regret over the 15 wrong twins: ρ = 0.79 (p = 0.001).
- **Detectability still does not predict cost reliably.** AUROC vs regret ρ = 0.38 (p = 0.16, was 0.16); paired RMSE vs regret ρ = 0.25 (p = 0.38, was 0.43). The positive point estimate is not significant with 15 twins, and noise-only twins at AUROC 0.99 to 1.0 stay cheap (sd ×0.5: 0.00005).
- **Versus `mimic-twingrid`.** With the twin set held fixed, the finer grid moves ρ from 0.16 to 0.38 (p = 0.16), not to a significant value, which is consistent with `mimic-twingrid`'s higher ρ coming mostly from having more gravity-error twins rather than from its grid.
- **Reading.** The grid was not driving the result: the costly twins are the ones with wrong gravity, friction errors stay cheap, and a two-sample test flags both. The ρ for AUROC moved up from 0.16 to 0.38 though stays inside noise, so a power analysis would be needed to say anything about a weak positive link.

```bash
cd research/mimic-twinswinggrid
pip install numpy scipy scikit-learn matplotlib pytest
python3 -m pytest tests                      # 9 tests
python3 experiments/run.py                   # about 10 minutes on 4 CPUs, writes experiments/results.txt and results.json
python3 experiments/figure.py                # experiments/auroc_vs_regret_fine.svg
```

## Motivation

A fidelity score is only useful if it tells you whether a twin is fit for its purpose. `mimic-twinswing` found it does not on a swing-up task, on a coarse grid. A null result that depends on a discretisation choice is weak, so this repeats it on a finer one.

## Method

`twin.py` is a copy of `mimic-twinswing/twin.py` (so this project stands alone). `experiments/run.py` tunes by grid search on 150 twin starts per seed and scores every grid point on the same 600 held-out real starts; regret is the twin-tuned controller's real cost minus the best of the grid. AUROC and paired RMSE of the passive-trajectory classifier do not depend on the controller grid, so they are not recomputed: `experiments/twinswing_results.json` is a copy of `mimic-twinswing`'s committed `results.json`.

## Limitations

One stylised pendulum and one task; a finer grid is still a grid (best gains may still sit near its edge); 12 seeds, and the g/L +20% regret is heavy-tailed (sd above its median); 15 twins give little power to detect a weak correlation; AUROC is borrowed from the earlier run rather than recomputed.

## Next steps

Let the controller's energy estimate use the twin's gravity; domain randomization over g/L as in `mimic-twinrand`; a power analysis as in `mimic-twinpower` for the two costly twins; a continuous optimiser (CMA-ES) instead of a grid.

## Owner steps

None.

## Outside dependencies

numpy, scipy, scikit-learn, matplotlib (figure only). Produced with AI assistance (Claude). No LLM proposer was used.

MIT.
