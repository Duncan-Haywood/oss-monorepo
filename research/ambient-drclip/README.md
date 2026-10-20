# ambient-drclip: does capping the inverse-propensity correction rescue doubly robust learning from an assistant's own feedback?

Track 2 (ambient AI assistant), follow-up to `ambient-dr`, whose first next step was "clipped DR pseudo-labels; test the 1/&epsilon; explanation by capping the correction". Produced with AI assistance. **Stylised, simulated results only**: every distribution is chosen by me and nothing is a claim about a real user, device or product. **Mixed result**: positive with an informed prior, negative with an uninformed one.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/ambient-drclip/

## Motivation

`ambient-dr` found that doubly robust (DR) pseudo-labels were worse than the biased fit and suggested, without testing it, that the correction term (S/&pi;)(y &minus; m) puts residuals up to 1/&epsilon; = 500 on a few explored windows. This project tests that by capping the inverse propensity in the correction.

## Builds on (and does not claim affiliation with)

- `research/ambient-dr` (and through it `ambient-labelmatch`, `ambient-fullinfo`, `ambient-ips`, `ambient-bandit`): simulated windows, decision rule, &epsilon;-greedy policy, MAP logistic fit and DR pseudo-labels, copied into `src/ambient_drclip/core.py` so the project is self-contained.
- Weight clipping/truncation of inverse-propensity terms is a standard variance-reduction device in off-policy evaluation; the DR idea is from Robins, Rotnitzky and Zhao (1994), *J. Amer. Statist. Assoc.* 89(427):846&ndash;866, and Dud&iacute;k, Langford and Li (2011), ICML (both as cited in `ambient-dr`). I cite no specific result from them, and the capped pseudo-label form is my own adaptation, not a reproduction.

No research group from `prompt.md` is built on; there is no lab tag.

## Method

Same world, policy, seeds and scoring as `ambient-dr` (fits at hour 100; 20 seeds; &epsilon; &isin; {0.002, 0.005, 0.02}; two priors; scored on 20 fresh 100 h held-out streams without exploration). The pseudo-label is ŷ<sub>i</sub> = m(x<sub>i</sub>) + S<sub>i</sub> min(1/&pi;<sub>i</sub>, c) (y<sub>i</sub> &minus; m(x<sub>i</sub>)), fitted by MAP logistic regression on all windows. Columns: `drc<c>_clip10` (c &isin; {1, 5, 20, 100}; outcome model m = the clip10 fit) and `drc<c>_prior` (m = the prior weights); `dr_clip10` is the unclipped `ambient-dr` form (c = &infin;). `biased`, `clip10`, `random_matched` (a control that uses labels a real assistant never sees) and `full` are as before. With c = 1 the pseudo-label is exactly y on windows where the assistant spoke and m elsewhere.

## Reproduce

```bash
cd research/ambient-drclip
pip install numpy pytest
PYTHONPATH=src python3 -m pytest -q tests       # 6 tests
PYTHONPATH=src python3 experiments/run.py       # about 15 minutes, writes experiments/results.txt
```

## Results (from `experiments/results.txt`; held-out utility per hour, mean over 20 seeds; oracle 12.71, full-information fit 12.72)

| prior | &epsilon; | biased | clip10 | dr (c=&infin;) | m=clip10, c=1 | c=5 | c=20 | c=100 | m=prior, c=1 | c=5 | c=20 | c=100 | random_matched |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| uninformed | 0.002 | 1.59 | &minus;33.17 | &minus;48.77 | &minus;20.30 | &minus;22.71 | &minus;19.33 | &minus;34.90 | 4.01 | 4.01 | 4.01 | 4.95 | 12.15 |
| uninformed | 0.005 | &minus;0.15 | &minus;62.95 | &minus;15.89 | &minus;22.43 | &minus;18.23 | &minus;17.66 | &minus;31.14 | 4.01 | 4.01 | 4.10 | &minus;6.08 | 12.18 |
| uninformed | 0.020 | &minus;13.08 | &minus;96.19 | &minus;49.54 | &minus;39.42 | &minus;29.56 | &minus;18.07 | &minus;49.54 | 4.01 | 4.08 | 8.47 | &minus;47.74 | 12.52 |
| informed | 0.002 | 10.62 | 11.70 | 0.26 | 11.67 | 11.68 | 11.74 | 11.84 | 11.82 | 11.84 | 11.93 | 12.17 | 12.48 |
| informed | 0.005 | 10.84 | 12.15 | 11.00 | 12.15 | 12.16 | 12.19 | 12.08 | 11.83 | 11.88 | 12.08 | 12.35 | 12.49 |
| informed | 0.020 | 11.42 | 12.52 | 12.35 | 12.49 | 12.51 | 12.51 | 12.35 | 11.83 | 11.98 | 12.37 | 12.34 | 12.48 |

The biased, clip10, unclipped DR and random_matched columns reproduce `ambient-dr` exactly (same seeds). Standard deviations are in `results.txt`.

1. **Informed prior: capping removes the collapse.** At &epsilon; = 0.002 the unclipped DR fit scores 0.26 and every capped fit scores 11.67&ndash;12.17, above the biased fit (10.62) and, for c = 100 with m = prior, close to the random-subset control (12.48). At &epsilon; = 0.005 and 0.02 the capped fits are within about 0.7 of clip10 (the m=prior fits with small caps are the furthest below), with no clear winner among caps. So the 1/&epsilon; explanation in `ambient-dr` is supported for this prior, as far as one cap grid can show.
2. **Uninformed prior: capping does not rescue DR.** Fits with the clip10 outcome model stay far below the biased fit at every cap (&minus;17 to &minus;50). Fits that use the prior as outcome model score 4&ndash;8 at small caps and fall to &minus;6 to &minus;48 at c = 100 for &epsilon; &ge; 0.005. The constant 4.01 across small caps and &epsilon; suggests these fits barely move from the prior, but I did not check that against the prior's own utility. The outcome model is poor here, and the prior-only model is weak too, so there is nothing for the correction to fix.
3. **No tuned winner.** The best cap differs by cell, differences among caps with the informed prior are within the seed noise I would expect (not formally tested), and I did not cross-fit or select c on held-out data. Practical use would need c chosen without peeking at the held-out streams.

## Limitations

- Same stylised world as `ambient-dr`: independent windows, instant noise-free feedback, a model with the true functional form, costs chosen by me.
- One fit hour (100), one prevalence, 20 seeds, four caps; variance with the uninformed prior is large (tens of utility per hour), so only large gaps are reliable.
- Clipping makes the estimator biased by design; I did not measure the bias. No cross-fitting or self-normalisation was tried.
- `random_matched` and `full` use labels of windows where the assistant stayed silent, which a deployed assistant never sees.

## Next steps

- Cross-fitted outcome models (fit m on a separate split) combined with a cap, and a cap chosen by validation rather than a grid.
- Larger caps/other &epsilon; for the uninformed prior, or a better outcome model, to see whether DR can win anywhere.
- Real accept/dismiss logs, if the owner opts in to collecting them.

## Outside dependencies

numpy (and pytest for the tests). No model, dataset, service or hardware is used.
