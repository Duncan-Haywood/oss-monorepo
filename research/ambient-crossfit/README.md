# ambient-crossfit: does cross-fitting the outcome model help capped doubly robust learning from an assistant's own feedback?

Track 2 (ambient AI assistant), follow-up to `ambient-drclip`, whose first next step was "cross-fitted outcome models combined with a cap". Produced with AI assistance. **Stylised, simulated results only**: every distribution is chosen by me and nothing is a claim about a real user, device or product. **Negative result**: cross-fitting changed little where capping already worked and did not rescue the uninformed-prior case.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/ambient-crossfit/

## Motivation

In `ambient-drclip` the outcome model m behind the doubly robust (DR) pseudo-label was fitted on the same labelled windows whose residuals y &minus; m the correction then uses, so those residuals are in-sample and shrunk. Cross-fitting (predict each window with a model that never saw it) is the standard remedy in the double/debiased machine-learning literature (Chernozhukov et al. 2018, *The Econometrics Journal* 21(1):C1&ndash;C68). I cite it for the idea only; the form here is my own adaptation, not a reproduction of their estimator or results.

## Builds on (and does not claim affiliation with)

- `research/ambient-drclip` (and through it `ambient-dr` and earlier): world, &epsilon;-greedy policy, MAP logistic fit and `dr_labels`, copied into `src/ambient_crossfit/core.py` so the project is self-contained.
- DR and clipping references as cited in `ambient-dr` and `ambient-drclip`.

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
PYTHONPATH=src python3 -m pytest -q tests       # 5 tests
PYTHONPATH=src python3 experiments/run.py       # several minutes, writes experiments/results.txt
```

## Results (from `experiments/results.txt`; held-out utility per hour, mean over 20 seeds; oracle 12.71, full-information fit 12.72)

| prior | &epsilon; | biased | clip10 | plug5 | cross5 | plug20 | cross20 | plug100 | cross100 | plug&infin; | cross&infin; | random_matched |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| uninformed | 0.002 | 1.59 | &minus;33.17 | &minus;22.71 | &minus;20.57 | &minus;19.33 | &minus;14.33 | &minus;34.90 | &minus;40.51 | &minus;48.77 | &minus;44.31 | 12.15 |
| uninformed | 0.005 | &minus;0.15 | &minus;62.95 | &minus;18.23 | &minus;20.71 | &minus;17.66 | &minus;27.92 | &minus;31.14 | &minus;61.74 | &minus;15.89 | &minus;42.46 | 12.18 |
| uninformed | 0.020 | &minus;13.08 | &minus;96.19 | &minus;29.56 | &minus;13.09 | &minus;18.07 | &minus;51.85 | &minus;49.54 | &minus;59.33 | &minus;49.54 | &minus;59.33 | 12.52 |
| informed | 0.002 | 10.62 | 11.70 | 11.68 | 11.63 | 11.74 | 11.68 | 11.84 | 11.79 | 0.26 | 1.53 | 12.48 |
| informed | 0.005 | 10.84 | 12.15 | 12.16 | 12.10 | 12.19 | 12.14 | 12.08 | 12.08 | 11.00 | 10.96 | 12.49 |
| informed | 0.020 | 11.42 | 12.52 | 12.51 | 12.49 | 12.51 | 12.51 | 12.35 | 12.34 | 12.35 | 12.34 | 12.48 |

The `biased`, `clip10`, `random_matched` columns and every `plug` column reproduce `ambient-drclip` exactly (same seeds). Standard deviations are in `results.txt`.

1. **Informed prior: cross-fitting makes no practical difference.** For finite caps, `cross` is within 0.06 utility/h of `plug` in every cell, usually slightly below. For the unclipped form at &epsilon; = 0.002 it scores 1.53 against 0.26, still far below the 11.6&ndash;11.8 of the capped fits, so the cap, not cross-fitting, is what removes the collapse.
2. **Uninformed prior: no consistent direction, still bad.** Cross-fitting is better in some cells (&epsilon; = 0.02, c = 5: &minus;13.09 vs &minus;29.56) and worse in others (&epsilon; = 0.02, c = 20: &minus;51.85 vs &minus;18.07). Seed standard deviations are tens of utility per hour, and no cell is near `random_matched` or even reliably above `biased`. I did not test the differences formally.
3. **A weak outcome model is the likely bottleneck, not residual shrinkage.** This is a hypothesis consistent with the table, not something I isolated.

## Limitations

- Same stylised world as `ambient-drclip`: independent windows, instant noise-free feedback, costs chosen by me. 20 seeds, one fit hour, one prevalence.
- Two folds assigned by position only; no repeated splits, more folds, or cap chosen by validation (the other half of the `ambient-drclip` next step is still open).
- Clipping makes the estimator biased by design; bias not measured. No self-normalisation.
- `random_matched` and `full` use labels a deployed assistant never sees.

## Next steps

- Choose the cap by validation on logged data (for example by the pseudo-label's own cross-validated loss), and more folds or repeated splits.
- A better outcome model (richer features, or one fitted with a larger prior precision) for the uninformed prior.
- Real accept/dismiss logs, if the owner opts in to collecting them.

## Outside dependencies

numpy (and pytest for the tests). No model, dataset, service or hardware is used.
