# ambient-drvalid: does a doubly robust validation score choose the doubly robust cap better than an IPS score?

Track 2 (ambient AI assistant), follow-up to `ambient-capcv`, whose first next step was "lower-variance validation scores (DR rather than IPS estimates, more folds, repeated splits)". Produced with AI assistance. **Stylised, simulated results only**: every distribution is chosen by me and nothing is a claim about a real user, device or product. **Mostly negative / preliminary**: swapping in a DR score changes almost nothing; only 8 random folds with the DR score helps clearly (at one rate), and the uninformed-prior case stays far below the label-matched control.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/ambient-drvalid/

## Motivation

`ambient-capcv` chose the cap on the inverse-propensity correction by an inverse-propensity-scoring (IPS) estimate of held-out utility, and found the estimate too noisy for the uninformed prior. A doubly robust (DR) estimate of the same quantity (Dud&iacute;k, Langford and Li, 2011, "Doubly robust policy evaluation and learning", ICML) adds a model-based baseline, which can reduce variance. Does it help here?

## Builds on (and does not claim affiliation with)

- `research/ambient-capcv`, `ambient-crossfit`, `ambient-drclip` and earlier: world, &epsilon;-greedy policy, MAP logistic fit and DR pseudo-labels, copied into `src/ambient_drvalid/core.py` so the project is self-contained.
- Dud&iacute;k, Langford and Li (2011) for the DR estimator idea (ICML 2011, arXiv:1103.4601).

No research group from `prompt.md` is built on; there is no lab tag.

## Method

Everything is as in `ambient-capcv` (same world, seeds, fit hour 100, &epsilon; &isin; {0.002, 0.005, 0.02}, two priors, 20 held-out 100 h streams scored without exploration). Only the cap selector differs. Each selector picks a cap from {2, 5, 10, 20, 50, 100, &infin;} and the final fit is the plug-in DR fit at that cap:

- `cv_ips`: 4 contiguous folds, uncapped IPS value (identical to `cv` in `ambient-capcv`; the numbers reproduce it exactly).
- `cv_dr`: the same 4 folds, with a DR value: the expected utility under a clip10 outcome model fitted on the training folds, plus the uncapped IPS-weighted residual on windows where the rule would speak and a label was seen (`dr_value`).
- `cv_dr8r`: DR value over 8 folds whose windows are assigned at random.

`fixed*`, `biased`, `clip10`, `hindsight` (best grid cap on the held-out streams; optimistic, unavailable to a real assistant) and `random_matched` are as before.

## Reproduce

```bash
cd research/ambient-drvalid
pip install numpy pytest
PYTHONPATH=src python -m pytest -q tests        # 7 tests
PYTHONPATH=src python experiments/run.py        # about 50 minutes on a CPU, writes experiments/results.txt
```

## Results (from `experiments/results.txt`; held-out utility per hour, mean over 20 seeds; oracle 12.71)

| prior | &epsilon; | biased | cv_ips | cv_dr | cv_dr8r | hindsight | random_matched |
|---|---|---|---|---|---|---|---|
| uninformed | 0.002 | 1.59 | &minus;21.35 | &minus;15.58 | &minus;11.44 | 0.79 | 12.15 |
| uninformed | 0.005 | &minus;0.15 | &minus;17.70 | &minus;26.92 | &minus;9.62 | 6.49 | 12.18 |
| uninformed | 0.020 | &minus;13.08 | &minus;1.43 | &minus;1.43 | 5.93 | 7.44 | 12.52 |
| informed | 0.002 | 10.62 | 11.45 | 11.43 | 11.34 | 12.11 | 12.48 |
| informed | 0.005 | 10.84 | 12.23 | 12.23 | 12.19 | 12.40 | 12.49 |
| informed | 0.020 | 11.42 | 12.56 | 12.56 | 12.49 | 12.65 | 12.48 |

Seed standard deviations, the fixed-cap columns and the chosen-cap histograms are in `results.txt`.

1. **Informed prior: no difference.** The three selectors are within 0.12 of each other in every cell, well inside seed noise (std 0.6&ndash;2.6).
2. **Uninformed prior: noisy, no consistent winner.** `cv_dr` equals `cv_ips` at &epsilon; = 0.02 (same caps chosen), is better at 0.002 (&minus;15.6 vs &minus;21.4) and worse at 0.005 (&minus;26.9 vs &minus;17.7), with seed standard deviations of 20&ndash;51 in those cells. I would not call either better.
3. **8 random folds with the DR score is the best selector in all three uninformed cells** (&minus;11.4, &minus;9.6, 5.9) and has the lowest seed spread at &epsilon; = 0.02 (std 4.65 against 24). It is still far below `random_matched` (about 12) and, at the two smaller rates, below the `biased` fit's &minus;0.15&ndash;1.59, so the cap-selection route does not rescue learning from the assistant's own feedback in this world. Because three things changed at once (score, fold count, fold type), this experiment does not say which one matters; that is untested.

## Limitations

- Same stylised world as `ambient-crossfit`: independent windows, instant noise-free feedback, costs chosen by me. 20 seeds, one fit hour, one prevalence.
- Random folds are valid here only because windows are independent; for real conversations they would leak across neighbouring windows.
- The selectors differ in score, fold count and fold type together; no ablation. No formal significance tests.
- The DR value ignores the wake phrase, as the IPS value did.

## Next steps

- Ablate the three changes (DR with 4 random folds; IPS with 8 random folds; repeated splits).
- A better outcome model for the uninformed prior, which remains the bottleneck.
- Real accept/dismiss logs, if the owner opts in to collecting them.

## Outside dependencies

numpy (and pytest for the tests). No model, dataset, service or hardware is used.
