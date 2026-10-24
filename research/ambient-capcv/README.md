# ambient-capcv: can the doubly robust cap be chosen by validation on logged data?

Track 2 (ambient AI assistant), follow-up to `ambient-crossfit`, whose first next step was "choose the cap by validation on logged data". Produced with AI assistance. **Stylised, simulated results only**: every distribution is chosen by me and nothing is a claim about a real user, device or product. **Mixed / preliminary result**: validation-chosen caps match or slightly beat the best fixed cap with an informed prior, and do not rescue the uninformed prior.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/ambient-capcv/

## Motivation

`ambient-drclip` and `ambient-crossfit` showed that capping the inverse-propensity correction in doubly robust (DR) pseudo-labels removes the collapse at small exploration rates, but the best cap differs by cell and a real assistant cannot see held-out utility. Can the cap be chosen from the log alone?

## Builds on (and does not claim affiliation with)

- `research/ambient-crossfit`, `ambient-drclip` and earlier: world, &epsilon;-greedy policy, MAP logistic fit and DR pseudo-labels, copied into `src/ambient_capcv/core.py` so the project is self-contained. DR and inverse-propensity-scoring (IPS) ideas are cited there.

No research group from `prompt.md` is built on; there is no lab tag.

## Method

Same world, seeds, fit hour (100), &epsilon; &isin; {0.002, 0.005, 0.02}, two priors and held-out scoring (20 fresh 100 h streams, no exploration) as `ambient-crossfit`. The DR fit is the in-sample ("plug") form: outcome model = clip10 fit, inverse propensity capped at c.

- `fixed<c>`, c &isin; {5, 20, 100, &infin;}: preset caps (identical to `plug<c>` in `ambient-crossfit`).
- `cv`: choose c from the grid {2, 5, 10, 20, 50, 100, &infin;} by 4-fold validation on the log. For each fold, fit the DR model on the other three folds and score it on the held-out fold by an **uncapped IPS estimate of the rule's mean utility** (benefit if it speaks on a window that needs help, minus cost if not, weighted by 1/propensity on windows where the assistant spoke). The winning cap is refit on all windows. Only logged quantities are used.
- `hindsight`: the grid cap with the best held-out utility, chosen on the same held-out stream it is scored on. This uses information a real assistant never has and is optimistically biased; read it as a rough ceiling for the grid, not an achievable result.
- `biased`, `clip10`, `random_matched` (uses labels never seen) and `full` as before.

## Reproduce

```bash
cd research/ambient-capcv
pip install numpy pytest
PYTHONPATH=src python3 -m pytest -q tests       # 5 tests
PYTHONPATH=src python3 experiments/run.py       # about 30 minutes on a CPU, writes experiments/results.txt
```

## Results (from `experiments/results.txt`; held-out utility per hour, mean over 20 seeds; oracle 12.71, full-information fit 12.72)

| prior | &epsilon; | biased | fixed5 | fixed20 | fixed100 | fixed&infin; | cv | hindsight | random_matched |
|---|---|---|---|---|---|---|---|---|---|
| uninformed | 0.002 | 1.59 | &minus;22.71 | &minus;19.33 | &minus;34.90 | &minus;48.77 | &minus;21.35 | 0.79 | 12.15 |
| uninformed | 0.005 | &minus;0.15 | &minus;18.23 | &minus;17.66 | &minus;31.14 | &minus;15.89 | &minus;17.70 | 6.49 | 12.18 |
| uninformed | 0.020 | &minus;13.08 | &minus;29.56 | &minus;18.07 | &minus;49.54 | &minus;49.54 | &minus;1.43 | 7.44 | 12.52 |
| informed | 0.002 | 10.62 | 11.68 | 11.74 | 11.84 | 0.26 | 11.45 | 12.11 | 12.48 |
| informed | 0.005 | 10.84 | 12.16 | 12.19 | 12.08 | 11.00 | 12.23 | 12.40 | 12.49 |
| informed | 0.020 | 11.42 | 12.51 | 12.51 | 12.35 | 12.35 | 12.56 | 12.65 | 12.48 |

Seed standard deviations are in `results.txt`; the `fixed` columns reproduce `plug` in `ambient-crossfit` exactly.

1. **Informed prior: validation is about as good as the best fixed cap.** `cv` is within 0.06 of the best fixed cap at &epsilon; = 0.005 and 0.02 (12.23 vs 12.19; 12.56 vs 12.51), and 0.39 below the best at &epsilon; = 0.002 (11.45 vs 11.84) with a larger spread across seeds (std 2.60 against about 0.8). Differences of this size are inside seed noise; I did not test them formally.
2. **Uninformed prior: still bad, and highly variable.** `cv` is between &minus;21 and &minus;1 utility/h with seed standard deviations of 24&ndash;51, far from `random_matched` (about 12) and, except at &epsilon; = 0.02, no better than the fixed caps. The &epsilon; = 0.02 gain (&minus;1.43 vs &minus;13.08 for `biased`) comes with std 24, so I would not call it reliable.
3. **The IPS validation score is noisy.** Chosen caps are spread over the whole grid (see the last line of each cell in `results.txt`), which is what one expects from a rare-event, high-variance estimator at these sample sizes. This is my reading, not isolated by a separate experiment.

## Limitations

- Same stylised world as `ambient-crossfit`: independent windows, instant noise-free feedback, costs chosen by me. 20 seeds, one fit hour, one prevalence.
- The IPS validation value ignores the wake phrase (the same for every candidate), uses contiguous folds, and 4 folds only; other selection criteria (for example the pseudo-label's cross-validated loss) were not tried.
- `hindsight` is selected and scored on the same stream, so it is optimistic.
- No formal significance tests. Clipping is biased by design; bias not measured.

## Next steps

- Lower-variance validation scores (DR rather than IPS estimates, more folds, repeated splits), and a pseudo-label loss criterion.
- A better outcome model for the uninformed prior, which remains the bottleneck.
- Real accept/dismiss logs, if the owner opts in to collecting them.

## Outside dependencies

numpy (and pytest for the tests). No model, dataset, service or hardware is used.
