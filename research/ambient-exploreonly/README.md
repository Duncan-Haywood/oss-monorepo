# ambient-exploreonly: does fitting only on the windows an assistant explored at random fix learning from its own accept/dismiss feedback?

Track 2 (ambient AI assistant), follow-up to `ambient-labelmatch` and the chain of estimator fixes after it (`ambient-dr`, `ambient-drclip`, `ambient-crossfit`, `ambient-capcv`, `ambient-drvalid`, `ambient-drablate`, `ambient-drrepeat`). Every one of those tried to repair a biased fit by reweighting or by adding an outcome model. This project asks a simpler question: what if the learner just ignores every window where it spoke for a reason other than the &epsilon; coin? Produced with AI assistance. **Stylised, simulated results only**: every distribution is chosen by me and nothing is a claim about a real user, device or product. **Negative result: with a converged solver the plain fit on every spoken window beats the explore-only fit at every &epsilon; and under both priors.** An earlier version of this page reported the opposite; that was the MAP solver diverging (corrected 2026-11-22 after [quality audit round 96](../../portfolio/quality/audits/2026-11-22-ambient-exploreonly.json); see "Correction" below).

**Live page:** https://marisstella.app/research/ambient-exploreonly/

## Motivation

`ambient-labelmatch` showed that a random sample of the same size nearly reaches the oracle, so the damage is selection, not label volume. The reweighting and doubly robust follow-ups were still far below that control with the uninformed prior. But the assistant already draws a random sample for free: every window where it spoke *only because the &epsilon; coin came up* (the model said no and no wake phrase was heard) was chosen independently of that window's need. Those windows need no weights. They are few (about &epsilon; of the silent windows), so the open question is whether a small, clean sample beats a large, contaminated one, and what exploration costs while it is gathered.

## Builds on (and does not claim affiliation with)

- `research/ambient-labelmatch`, `research/ambient-fullinfo`, `research/ambient-ips` and `research/ambient-bandit` in this repository: the simulated windows, decision rule, &epsilon;-greedy deployed learner and MAP logistic fit, copied into `src/ambient_exploreonly/core.py` so the project is self-contained. The `biased`, `random_matched` and `full` rows reproduce `ambient-labelmatch` exactly (same seeds, checked in `experiments/results.txt` for &epsilon; = 0.002, 0.005, 0.02).
- Langford, J. and Zhang, T. (2007). The epoch-greedy algorithm for contextual multi-armed bandits. NeurIPS 20. Learning only from the exploration rounds is that algorithm's update rule; this project is a stylised test of it against the plain refit, not a new method. (Cited from memory; not re-checked against the paper.)
- Shimodaira, H. (2000). Improving predictive inference under covariate shift by weighting the log-likelihood function. *Journal of Statistical Planning and Inference* 90(2):227-244. When selection depends only on the features and the model is correctly specified, the unweighted fit stays consistent, which is why the plain refit does well here. (Cited from memory; not re-checked.)
- Horvitz (1999), "Principles of mixed-initiative user interfaces", CHI '99, 159&ndash;166, <https://doi.org/10.1145/302979.303030>, for the expected-utility speaking rule (idea only; not a reproduction).

No research group from `prompt.md` is built on; there is no lab tag.

## Method

Same world as `ambient-labelmatch`: 360 windows per hour, 3% need, a score feature (d&prime; = 2), a keyword feature, a noisy-OR wake phrase, a benefit of 3 for a hit and a cost of 1 or 2 for a false interruption. The assistant speaks if its model says so or a wake phrase is heard; otherwise with probability &epsilon;. It refits every 10 minutes. A window is **explored** when it was spoken on only because of the coin.

**A. Offline, on the deployed history.** The deployed learner refits on every window where it spoke (as in `ambient-bandit`). At hour 100, five models are fitted on that same history with the same prior: **biased** (all spoken windows); **explore_only** (explored windows, unweighted); **explore_matched** (a uniformly random subset of *all* windows of the same size as the explored set; not deployable, it separates label volume from which windows were chosen); **random_matched** (random subset as large as the biased set); **full** (every window). Scored by utility per hour on 20 fresh 100 h held-out streams with no exploration.

**B. Online.** The learner itself refits on `biased` (all spoken windows) or `explore_only`. Reported: online utility per hour and dismissals per hour over hours 20&ndash;100, and the final weights scored on the held-out streams.

Two priors (uninformed: score weight 0; informed: score weight 1), &epsilon; &isin; {0.002, 0.005, 0.02, 0.05}, 20 seeds. Oracle 12.71.

## Reproduce

```bash
cd research/ambient-exploreonly
PYTHONPATH=src python3 -m pytest -q tests       # 6 tests
PYTHONPATH=src python3 experiments/run.py       # about 4 to 25 minutes depending on the machine, writes experiments/results.txt
python3 experiments/figure.py                   # writes experiments/explore_only.svg from results.txt
```

## Correction (2026-11-22)

The first version of this project fitted every model with 40 full Newton steps and no line search, a solver copied from earlier projects in the chain. From the uninformed prior, the deployed learner's fit diverged: its objective was 450 to 3,700 times the true minimum (for example 47,679 against 105.0 at &epsilon; = 0.002, seed 0), with weights 163 to 710 from the prior mean where any true MAP lies within about 35. Results 1 to 3 of that version ("the explore-only fit succeeds where every reweighting fit failed", "a small clean sample is enough", "online it turns a negative-utility assistant into a positive one") compared a working explore-only fit with a broken biased one. `fit_map` is now the damped Newton solver from `ambient-fullinfo` (step halving until the objective falls), `tests/test_exploreonly.py::test_biased_fit_from_the_uninformed_prior_is_stationary` fails on the old solver, and every table below was regenerated. The informed-prior rows did not change; they never diverged. The same undamped solver is in other ambient projects whose rows this one said it "reproduces exactly" (`ambient-labelmatch` among them); see `docs/reports/2026-11-22-ambient-fit-map-divergence.md`.

## Results (from `experiments/results.txt`; held-out utility per hour, mean over 20 seeds, std in the file)

**A. Uninformed prior, fits at hour 100** (labels: biased 1685 / 1757 / 2174 / 3094; explore_only 68 / 173 / 689 / 1726):

| &epsilon; | biased | explore_only | explore_matched | random_matched | full |
|---|---|---|---|---|---|
| 0.002 | 10.63 | 4.11 | 7.74 | 12.51 | 12.72 |
| 0.005 | 10.85 | 5.13 | 9.91 | 12.48 | 12.72 |
| 0.020 | 11.44 | 8.13 | 11.97 | 12.47 | 12.72 |
| 0.050 | 11.95 | 10.77 | 12.53 | 12.52 | 12.72 |

**A. Informed prior:**

| &epsilon; | biased | explore_only | explore_matched | random_matched |
|---|---|---|---|---|
| 0.002 | 10.62 | 6.03 | 7.77 | 12.48 |
| 0.005 | 10.84 | 5.60 | 9.49 | 12.49 |
| 0.020 | 11.42 | 8.88 | 11.96 | 12.48 |
| 0.050 | 11.95 | 11.00 | 12.44 | 12.53 |

**B. Online** (uninformed prior; online utility/h over hours 20&ndash;100 | dismissals/h | held-out utility of the final model):

| &epsilon; | biased learner | explore_only learner |
|---|---|---|
| 0.002 | 9.65 \| 9.9 \| 10.63 | 6.23 \| 3.1 \| 7.36 |
| 0.005 | 8.48 \| 10.6 \| 10.85 | 6.49 \| 3.7 \| 9.47 |
| 0.020 | 2.65 \| 14.8 \| 11.44 | 2.30 \| 10.4 \| 11.72 |
| 0.050 | &minus;9.82 \| 24.1 \| 11.95 | &minus;9.98 \| 20.7 \| 12.18 |

With the informed prior the online figures are almost the same (biased 9.65, 8.50, 2.67, &minus;9.80; explore_only 5.52, 7.20, 2.38, &minus;9.94).

1. **The plain refit on every spoken window is the better offline fit at every &epsilon;, under both priors.** With the uninformed prior it scores 10.63 to 11.95 against 4.11 to 10.77 for the explore-only fit. Selection here is on the features only and the model is correctly specified, so the unweighted fit stays close to consistent (Shimodaira 2000); its remaining gap to random_matched (about 0.5 to 1.9) is the cost of the wake-phrase windows, which are selected partly on need.
2. **The explore-only sample is too small to compete.** It has 68 to 1,726 labels against 1,685 to 3,094, and at the same size a uniform sample (explore_matched) does better in all eight cells, so the explored windows are not even a good sample for their size: they exclude the windows the model already wants to speak on, which hold most of the needs.
3. **Online, the biased learner earns more at small &epsilon; and the two are level at larger &epsilon;.** At &epsilon; = 0.005: 8.48 against 6.49 per hour. The explore-only learner interrupts less (3.7 against 10.6 dismissals per hour; I have not checked why), and at &epsilon; = 0.02 and 0.05 its final model is slightly better (11.72 and 12.18 against 11.44 and 11.95, within one standard deviation).
4. **Exploration is not free.** Online utility falls steeply with &epsilon; for both learners (from about 9.7 at 0.002 to about &minus;9.9 at 0.05) while the final models improve only by about 1.3 per hour. In this world a small &epsilon; is the better trade.
5. **No unexplained instability remains.** The erratic explore_matched cells of the first version (std 31.6 and 36.0) are gone; they were the same solver failure on small samples.

## Limitations

- Same stylised world as the rest of the chain: independent windows, instant noise-free accept/dismiss, a model with the true functional form, costs and benefit chosen by me. In such a well-specified model, choosing windows by features does not bias a logistic fit; real classifiers are misspecified and that argument weakens.
- The explored windows exclude wake-phrase windows, which correlate with need given the features (the wake flag is not a model feature). That is a selection on the outcome; the biased fit includes them and so is selected on the outcome too, which is the likely source of its intercept bias (&minus;3.6 to &minus;4.5 against &minus;6.0 for the oracle). I did not separate this from shrinkage toward the prior.
- Online utility ignores the possibility that a user turns the assistant off after a burst of false interruptions; at &epsilon; = 0.05 the dismissal rates (21 to 64 per hour) would plausibly do so.
- One prevalence (3%), one hour (100), one decay-free &epsilon;, 20 seeds, large seed spread at small label counts. No formal tests and no multiple-comparison correction across the cells.

## Next steps

- An exploration schedule (large &epsilon; early, decayed once the model stabilises) and the break-even &epsilon; against the always-on cost of dismissals.
- Combine the explore-only sample with a down-weighted use of the biased windows (a small-labelled-set plus a larger noisy set) and with the clipped fits of `ambient-labelmatch`.
- Test misspecification (a non-logistic need-to-feature relationship) to see whether selection on features stays harmless.
- Real accept/dismiss logs, if the owner opts in to collecting them.

## Outside dependencies

numpy (and pytest for the tests). No model, dataset, service or hardware is used.
