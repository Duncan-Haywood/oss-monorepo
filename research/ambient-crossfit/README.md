# ambient-crossfit: does cross-fitting the outcome model help capped doubly robust learning from an assistant's own feedback?

Track 2 (ambient AI assistant), follow-up to `ambient-drclip`, whose first next step was "cross-fitted outcome models combined with a cap". Produced with AI assistance. **Stylised, simulated results only**: every distribution is chosen by me and nothing is a claim about a real user, device or product. **Negative result**: cross-fitting the outcome model never helps; with a finite cap it is slightly worse (by up to 0.08 utility/h with a finite cap) in 23 of 24 cells, under either prior.

> **Corrected 2026-11-18.** The first version of this project used an undamped Newton `fit_map` with no convergence check. The 2026-11-17 quality audit ([`portfolio/quality/audits/2026-11-17-ambient-crossfit.json`](../../portfolio/quality/audits/2026-11-17-ambient-crossfit.json)) showed it diverged in every uninformed-prior run and in the unclipped informed runs at &epsilon; = 0.002, so those rows (&minus;13 to &minus;96 utility/h, and the "collapse" to 0.26 / 1.53) were optimiser failures, not estimator behaviour. `fit_map` is now a damped Newton (Armijo backtracking) that stops on a gradient test and raises if it has not converged; every row below is from the rerun. The informed finite-cap rows did not change; the old conclusions about the uninformed prior (results 2 and 3 of the first version) are withdrawn. The same old `fit_map` is still in 12 sibling `ambient-*` projects, whose uninformed-prior results need the same rerun.

**Live page:** https://marisstella.app/research/ambient-crossfit/

## Motivation

In `ambient-drclip` the outcome model m behind the doubly robust (DR) pseudo-label was fitted on the same labelled windows whose residuals y &minus; m the correction then uses, so those residuals are in-sample and shrunk. Cross-fitting (predict each window with a model that never saw it) is the standard remedy in the double/debiased machine-learning literature (Chernozhukov et al. 2018, *The Econometrics Journal* 21(1):C1&ndash;C68). I cite it for the idea only; the form here is my own adaptation, not a reproduction of their estimator or results.

## Builds on (and does not claim affiliation with)

- `research/ambient-drclip` (and through it `ambient-dr` and earlier): world, &epsilon;-greedy policy, MAP logistic fit and `dr_labels`, copied into `src/ambient_crossfit/core.py` so the project is self-contained.
- DR and clipping references as cited in `ambient-dr` and `ambient-drclip`.

Nearest prior work, cited for context, not reproduced: augmented inverse-propensity weighting (Robins, Rotnitzky & Zhao 1994, *JASA* 89:846&ndash;866); cross-fitted doubly robust policy learning (Athey & Wager 2021, *Econometrica* 89(1):133&ndash;161); the DR-learner, which regresses DR pseudo-outcomes with squared loss (Kennedy 2023, *Electronic Journal of Statistics* 17(2):3008&ndash;3049). Here the outcome model is a 4-parameter logistic fit on thousands of labelled windows, so its own-observation overfitting is of order p/n and a large cross-fitting effect was not expected a priori; the pseudo-labels are regressed with logistic loss (convex for any real label, made strictly convex by the prior), not the squared loss of the DR-learner.

No research group from `prompt.md` is built on; there is no lab tag.

## Method

Same world, seeds, fit hour (100), &epsilon; &isin; {0.002, 0.005, 0.02}, two priors and held-out scoring (20 fresh 100 h streams, no exploration) as `ambient-drclip`. Outcome model: the clip10 fit (inverse-propensity weights capped at 10). Two variants, each with the correction's inverse propensity capped at c &isin; {5, 20, 100, &infin;}:

- `plug<c>`: m is the clip10 fit on all labelled windows (the `ambient-drclip` form; in-sample residuals);
- `cross<c>`: windows are split by position into 2 folds; each window's m comes from a clip10 fit on the labelled windows of the *other* fold (out-of-sample residuals). The final logistic fit on the pseudo-labels uses all windows.

`biased`, `clip10`, `random_matched` (uses labels a real assistant never sees) and `full` are as before.

## Reproduce

```bash
cd research/ambient-crossfit
pip install numpy pytest
PYTHONPATH=src python3 -m pytest -q tests       # 7 tests
PYTHONPATH=src python3 experiments/run.py       # about 50 seconds, writes experiments/results.txt
```

## Results (from `experiments/results.txt`; held-out utility per hour, mean over 20 seeds; oracle 12.71, full-information fit 12.72)

| prior | &epsilon; | biased | clip10 | plug5 | cross5 | plug20 | cross20 | plug100 | cross100 | plug&infin; | cross&infin; | random_matched |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| uninformed | 0.002 | 10.63 | 11.70 | 11.68 | 11.61 | 11.74 | 11.66 | 11.82 | 11.75 | 9.40 | 9.26 | 12.51 |
| uninformed | 0.005 | 10.85 | 12.14 | 12.15 | 12.10 | 12.17 | 12.13 | 12.04 | 12.02 | 11.00 | 10.92 | 12.48 |
| uninformed | 0.020 | 11.44 | 12.51 | 12.50 | 12.50 | 12.53 | 12.51 | 12.36 | 12.33 | 12.36 | 12.33 | 12.47 |
| informed | 0.002 | 10.62 | 11.70 | 11.68 | 11.63 | 11.74 | 11.68 | 11.84 | 11.79 | 9.27 | 9.12 | 12.48 |
| informed | 0.005 | 10.84 | 12.15 | 12.16 | 12.10 | 12.19 | 12.14 | 12.08 | 12.08 | 11.00 | 10.96 | 12.49 |
| informed | 0.020 | 11.42 | 12.52 | 12.51 | 12.49 | 12.51 | 12.51 | 12.35 | 12.34 | 12.35 | 12.34 | 12.48 |

Standard deviations over seeds are in `results.txt` (0.5&ndash;0.9 for every finite-cap fit; 3.5&ndash;3.7 for the unclipped fits at &epsilon; = 0.002). The file ends with a paired test: cross minus plug on the same 20 seeds, for each of the 24 (prior, &epsilon;, cap) cells.

1. **Cross-fitting never helps.** In 23 of 24 cells the cross-fitted fit scores below the in-sample one (the exception is +0.001). With a finite cap the gap is at most 0.08 utility/h; 13 cells have |t| &gt; 2.09 (p &lt; 0.05, unadjusted), 5 survive a Bonferroni correction over the 24, and none is in cross-fitting's favour. A likely reason, not isolated here: each fold's outcome model sees half the labels, so its predictions are noisier, while the in-sample shrinkage it removes is tiny for a 4-parameter model.
2. **The cap matters more than how the outcome model is fitted.** Unclipped DR at &epsilon; = 0.002 scores 9.1&ndash;9.4 (std about 3.6) against 11.6&ndash;11.8 for any finite cap, with either prior. That is a large loss and a noisy one, not the collapse to near zero the first version reported.
3. **The prior barely matters at hour 100.** With a converged fitter, uninformed and informed rows agree to within 0.15 utility/h in every column; 100 hours of logs overwhelm the prior.
4. **Every finite-cap DR fit beats the deployed `biased` learner** (by 0.9 to 1.4 utility/h) but stays below `random_matched` (12.5), which uses labels a real assistant never sees.

## Limitations

- Same stylised world as `ambient-drclip`: independent windows, instant noise-free feedback, costs chosen by me. 20 seeds, one fit hour, one prevalence.
- Two folds assigned by position only; no repeated splits, more folds, or cap chosen by validation (the other half of the `ambient-drclip` next step is still open).
- Clipping makes the estimator biased by design; bias not measured. No self-normalisation.
- The 24 paired tests share seeds and are correlated; the Bonferroni count is conservative and the unadjusted one is not a family-wise result.
- `random_matched` and `full` use labels a deployed assistant never sees.

## Known gaps

- The 2026-11-17 audit's remaining points are open: the "oracle" ignores that wake windows are spoken anyway, so it is not quite the ceiling (`full` 12.72 > oracle 12.71); and no test pins a reported number.
- Sibling `ambient-*` projects still carry the old `fit_map`.

## Next steps

- Choose the cap by validation on logged data (for example by the pseudo-label's own cross-validated loss), and more folds or repeated splits.
- Real accept/dismiss logs, if the owner opts in to collecting them.

## Outside dependencies

numpy (and pytest for the tests). No model, dataset, service or hardware is used.
