# How many real trajectories does a classifier test need to flag a wrong digital twin, and are the twins it flags the ones that cost a controller?

Track 11 (adversarial human imitation), side project, a follow-up to `mimic-twinregret`. That project found that a classifier two-sample test (C2ST) at 800 vs 800 trajectories separates many twins that cost a controller nothing. A real user has far fewer than 800 real trajectories, so this one asks the practical version: at what sample size does the test start to flag each twin, and does it flag the costly ones first? **No LLM is used and no text is generated.** Stylised and simulated only. **Preliminary: one toy pendulum, one task, 20 replicates per cell.** Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/mimic-twinpower/

Numbers come from `experiments/results.txt` and `results.json`; the figure is `experiments/power_vs_n.svg`.

- **Setup.** The 16 twins, the real pendulum and the C2ST (boosted trees on raw plus second-difference features, 5-fold) are those of `mimic-twinregret`, imported unchanged. For each twin and each *n* in 10, 20, 40, 80, 160, draw *n* real and *n* twin passive trajectories, compute the cross-validated AUROC, and repeat 20 times. A twin is *flagged* in a replicate when its AUROC exceeds the 95th percentile of the exact-twin AUROCs at the same *n*. **Power** is the share of flagged replicates. Regret per twin is read from `mimic-twinregret/experiments/results.json`, not recomputed.
- **The costly twins are found early.** The six twins with regret of at least 0.001 (no Coulomb friction, g/L +20%, Gaussian instead of Student-t noise, noise ×1.5, ×2 and ×0) all reach power 0.8 by *n* = 80, and the four noise-related ones by *n* = 40 (power 0.8 to 1.0). In this system a small real sample is enough to flag every twin that matters to the controller.
- **So are some that cost nothing.** g/L −20% (power 0.65 at 40, 1.0 at 80), noise ×0.5 (1.0 at 40) and noise ×0.75 (0.75 at 40, 0.95 at 80) have regret exactly 0 and are flagged as early as the costly ones. A flag does not say the controller will suffer. Conversely Coulomb −10% and −20% are never reliably flagged up to *n* = 160 (power 0.05 and 0.30), and they also have regret 0, so the test's blind spot here is harmless.
- **Detection and regret agree only loosely.** Spearman correlation of power with regret over the 15 wrong twins: 0.48 at *n* = 40 (p = 0.07), 0.52 at 80 (p = 0.048), 0.40 at 160 (p = 0.14). Correlations at *n* = 10 and 20 are undefined (see Limitations).
- **Reading.** Cheap detection is a safe alarm for this task (no costly twin slips through at *n* = 80) but a poor ranking: it cannot tell "differs" from "differs in a way that matters". Regret on the task is the measurement that does, and it needs the task and a real-system cost evaluation, which a real user may not have.

```bash
cd research/mimic-twinpower
pip install numpy scipy scikit-learn matplotlib joblib pytest
python3 -m pytest tests                      # 5 tests
OMP_NUM_THREADS=1 python3 experiments/run.py # about 12 minutes on 4 CPUs, writes experiments/results.txt and results.json
python3 experiments/figure.py                # experiments/power_vs_n.svg
```

## Motivation

The portfolio's theme is simulation fidelity. `mimic-twinregret` showed detection and usefulness come apart at a large sample. Sample size is the lever a practitioner actually has, so this measures how early the alarm rings and whether it rings for the right twins.

## Builds on

`mimic-twinregret` (twins, C2ST, regret; imported), `mimic-twinc2st`, Lopez-Paz and Oquab (2017), "Revisiting Classifier Two-Sample Tests", ICLR. No lab's work is built on, and no lab endorses this project.

## Method

`twinpower.py`: `auroc_once` (one replicate), `null_threshold`, `power`, `n_needed`. `experiments/run.py` runs 16 twins × 5 sample sizes × 20 replicates in parallel. Each replicate has its own seed, shared across twins at the same *n* and replicate index. The threshold is computed per *n* from the 20 exact-twin replicates.

## Limitations

One system, one task, one classifier, 20 replicates per cell: powers are multiples of 0.05 with a binomial standard error up to about 0.11, and the 95th-percentile threshold from 20 null draws is itself coarse (the exact twin is "flagged" in 1 of 20 replicates at *n* ≥ 40 by construction). At *n* = 10 and 20 the cross-validated AUROC of the null sits at or below 0.5, so the threshold is 0.500 and nothing is flagged; this says the classifier is unusable at that size, not that twins are indistinguishable, and the correlations there are undefined. A different detector (a kernel MMD, a paired test with known start angles) could flag earlier. The zero/non-zero regret split inherits the 48-point grid quantisation of `mimic-twinregret`. Nothing here is a claim about a physical pendulum.

## Next steps

Repeat with a paired test on shared start angles, which `mimic-twinc2st` suggests is more sensitive; compute the sample size at which a twin's regret becomes distinguishable from the exact twin's, to compare with the detection sample size.

## Owner steps

None.

## Outside dependencies

numpy, scipy, scikit-learn, joblib (experiment), matplotlib (not required for the figure). Produced with AI assistance (Claude). No LLM proposer was used.

MIT.
