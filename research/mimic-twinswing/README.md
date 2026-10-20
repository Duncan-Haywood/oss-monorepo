# On a swing-up task where friction matters, does a digital twin's detectability predict what tuning on it costs?

Track 11 (adversarial human imitation), side project: the "Next steps" of `mimic-twinregret` asked for a task where friction matters. Its stabilisation task made most wrong twins harmless, so detectability and cost could not be told apart. Here the torque limit (4) is below gravity's pull (g/L = 9.81), so the pendulum must be pumped up against friction before it can be caught. **No LLM is used and no text is generated.** Stylised and simulated only. **Preliminary: one toy system, one task, a 60-point gain grid.** Produced with AI assistance.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/mimic-twinswing/

Numbers come from `experiments/results.txt` and `results.json`; the figure is `experiments/auroc_vs_regret.svg`.

- **Setup.** The "real" system is the `mimic-twinregret` pendulum (Coulomb 0.3, viscous 0.1, Student-t(3) sensor noise sd 0.02). The controller pumps energy along the filtered measured velocity (gain `ke`), then switches to PD (`kp`, `kd`) near the top (`cap`). It is picked from a 60-point grid on 150 twin start states and scored on 600 held-out real ones. Regret is the real cost of the twin-tuned controller minus the best grid point's. The best real cost is 0.353 (ke 8, kp 20, kd 4, cap 0.8). 15 wrong twins, 12 tuning seeds.
- **Only the gravity errors cost much.** g/L +20% has regret 0.0292 (8.3% of the best cost, sd 0.033 over seeds) and g/L −20% 0.0130 (3.7%, consistent across seeds). Every other wrong twin is below 0.0011 (0.3%): sensor-noise errors give 0.0007 to 0.0010 (Gaussian, ×1.5, ×2), no Coulomb friction 0.0009, the rest about 0.0001 or less. The exact twin's own regret is 0.00009, so the grid's flat region is not exactly zero here.
- **Friction did not become a costly error.** The hope that a swing-up would make wrong friction expensive was not borne out: Coulomb −67% (AUROC 0.997) and doubled viscous friction (0.959) cost no more than the exact twin. Most of these twins pick the same pump gain (4 or 8) as the exact twin, and the grid is flat between them.
- **Detectability does not predict cost.** Spearman across the 15 wrong twins: AUROC vs regret ρ = 0.16 (p = 0.57), paired RMSE vs regret ρ = 0.43 (p = 0.11). The twins with the largest paired error (0.23 to 0.25 rad) are exactly the two costly ones, but noise-only twins at AUROC 0.99 to 1.0 and paired error 0 cost almost nothing (sd ×0.5, ×0: 0.00006).
- **Reading.** On a task where the dynamics enter the controller's own energy estimate, the costly twin is the one whose dynamics are wrong in a way the controller uses, and noise errors stay cheap. A two-sample test flags both kinds, so it cannot be the filter that decides whether a twin is fit for the task.

```bash
cd research/mimic-twinswing
pip install numpy scipy scikit-learn matplotlib pytest
python3 -m pytest tests                      # 9 tests
python3 experiments/run.py                   # about 15 minutes on 4 CPUs, writes experiments/results.txt and results.json
python3 experiments/figure.py                # experiments/auroc_vs_regret.svg
```

## Motivation

A fidelity score is only useful if it tells you whether a twin is fit for its purpose. Track 11 treats a detector's accuracy as the fidelity score of a simulated human; `mimic-twinregret` asked it of a physical twin on an easy task. This repeats it on a harder one.

## Builds on

`mimic-twinregret` (same pendulum, noise models, twins and C2ST; `twin.py` is copied so this project stands alone) and `mimic-twinc2st`. Lopez-Paz and Oquab (2017), "Revisiting Classifier Two-Sample Tests", ICLR. Energy-based swing-up is the textbook method of Åström and Furuta (2000), "Swinging up a pendulum by energy control", *Automatica* 36; this project uses a crude version with a clipped torque and makes no comparison with it. No lab's work is built on, and no lab endorses this project.

## Method

`twin.py` has the pendulum with torque, noise models, the energy-pump plus PD controller on noisy finite-difference velocity, grid tuning with common random numbers across gain tuples, the C2ST and the paired RMSE. Tuning noise and held-out evaluation noise use separate seeded generators.

## Limitations

One system, one controller family and a 60-point grid; the best gain is at the grid edge (ke = 8) for several twins, so a wider grid could change which twins look harmless. Regret for g/L +20% is very uneven across seeds (median 0.010, mean 0.029). Fifteen points give weak correlations; neither is significant. The controller's own gravity constant is fixed at 9.81 and not tuned on the twin, which is part of why gravity errors matter. Simulated, not a real device.

## Next steps

Widen the gain grid; let the controller's energy estimate use the twin's gravity; domain randomization over g/L as in `mimic-twinrand`; a power analysis as in `mimic-twinpower` for the two costly twins.

## Owner steps

None.

## Outside dependencies

numpy, scipy, scikit-learn, matplotlib (figure only). Produced with AI assistance (Claude). No LLM proposer was used.

MIT.
