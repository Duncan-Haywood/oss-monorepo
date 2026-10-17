# ambient-drablate: which of score, fold count and fold type made cap selection better in ambient-drvalid?

Track 2 (ambient AI assistant), follow-up to `ambient-drvalid`, whose first next step was "ablate the three changes". Produced with AI assistance. **Stylised, simulated results only**: every distribution is chosen by me and nothing is a claim about a real user, device or product. **Mostly negative / preliminary**: no single factor explains the earlier result, and every selector stays far below the label-matched control.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/ambient-drablate/

## Motivation

`ambient-drvalid` found that "doubly robust (DR) score, 8 random folds" was the best cap selector in the uninformed-prior cells, but it changed score, fold count and fold type at once. Here all eight combinations are run on identical data.

## Builds on (and does not claim affiliation with)

- `research/ambient-drvalid`, `ambient-capcv`, `ambient-crossfit`, `ambient-drclip`: world, &epsilon;-greedy policy, MAP logistic fit, DR pseudo-labels and the IPS/DR validation values, copied into `src/ambient_drablate/core.py` so the project is self-contained.
- Dud&iacute;k, Langford and Li (2011), "Doubly robust policy evaluation and learning", ICML (arXiv:1103.4601), for the DR estimator.

No research group from `prompt.md` is built on; there is no lab tag.

## Method

Same world, seeds, fit hour (100), &epsilon; &isin; {0.002, 0.005, 0.02}, two priors, 20 held-out 100 h streams and cap grid {2, 5, 10, 20, 50, 100, &infin;} as in `ambient-drvalid`. Selector names are `<score>_<folds><type>`: score `ips` (uncapped IPS value) or `dr`; folds 4 or 8; type `c` (contiguous) or `r` (windows assigned to folds at random). The final fit is the plug-in DR fit at the chosen cap. Sanity check: `ips_4c`, `dr_4c` and `dr_8r` reproduce `cv_ips`, `cv_dr` and `cv_dr8r` of `ambient-drvalid` to the printed precision (e.g. &minus;21.35, &minus;15.58, &minus;11.44 at uninformed &epsilon; = 0.002).

## Reproduce

```bash
cd research/ambient-drablate
pip install numpy pytest
PYTHONPATH=src python -m pytest -q tests        # 7 tests
PYTHONPATH=src python experiments/run.py        # 4 processes, roughly 35 minutes, writes experiments/results.txt
```

## Results (held-out utility per hour, mean over 20 seeds; oracle 12.71)

Uninformed prior (std over seeds in `results.txt`: 4&ndash;55 in these cells):

| &epsilon; | ips_4c | ips_4r | ips_8c | ips_8r | dr_4c | dr_4r | dr_8c | dr_8r | biased | hindsight | random_matched |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 0.002 | &minus;21.35 | &minus;22.30 | &minus;13.17 | &minus;5.69 | &minus;15.58 | &minus;11.91 | &minus;10.17 | &minus;11.44 | 1.59 | 0.79 | 12.15 |
| 0.005 | &minus;17.70 | &minus;14.19 | &minus;11.87 | &minus;13.99 | &minus;26.92 | &minus;11.48 | &minus;18.55 | &minus;9.62 | &minus;0.15 | 6.49 | 12.18 |
| 0.020 | &minus;1.43 | 5.57 | 0.63 | 6.33 | &minus;1.43 | 5.24 | 4.92 | 5.93 | &minus;13.08 | 7.44 | 12.52 |

Informed prior: all eight selectors are within 0.16, 0.07 and 0.09 of each other at &epsilon; = 0.002, 0.005, 0.02 (11.30&ndash;11.46, 12.17&ndash;12.24, 12.47&ndash;12.56), inside seed noise (std 0.6&ndash;2.6).

1. **Informed prior: no difference** between any of the eight selectors.
2. **&epsilon; = 0.02: random folds help, the DR score does not.** Moving from contiguous to random folds raises the mean from &minus;1.4 to 5.6 (IPS, 4 folds) and from 0.6 to 6.3 (IPS, 8 folds) and cuts the seed std from 22&ndash;24 to 4&ndash;7. IPS on 8 random folds (6.33) is as good as DR on 8 random folds (5.93), so the earlier "DR score" credit is not supported in this cell. With DR, 8 contiguous folds also helps (4.92 vs &minus;1.43).
3. **&epsilon; = 0.005: no clear pattern.** The DR score on contiguous folds is worse than IPS (&minus;26.9 vs &minus;17.7) but the best selector is DR on 8 random folds (&minus;9.6); differences are small against stds of 24&ndash;51, and I would not rank them.
4. **&epsilon; = 0.002: more folds look better than 4 contiguous folds** for both scores (IPS: &minus;21.4 to &minus;13.2 / &minus;5.7), again with stds of 13&ndash;55; not a firm result.
5. In the two smaller-&epsilon; uninformed cells every selector stays below the unweighted `biased` fit or only near it, and in all uninformed cells far below `random_matched` (about 12). Cap selection by validation does not rescue learning from the assistant's own feedback in this world.

## Limitations

- Same stylised world as `ambient-crossfit`: independent windows, instant noise-free feedback, costs chosen by me. 20 seeds, one fit hour, one prevalence, no significance tests; many comparisons are inside seed noise.
- Random folds are valid here only because windows are independent; for real conversations they would leak across neighbouring windows.
- Repeated random splits (the third item in the earlier next steps) are not run; each random selector uses a single fold assignment.
- The DR value ignores the wake phrase, as the IPS value did.

## Next steps

- Repeated random splits (e.g. 5 assignments averaged) to separate fold-assignment noise from a real effect.
- A better outcome model for the uninformed prior, which remains the bottleneck.
- Real accept/dismiss logs, if the owner opts in to collecting them.

## Outside dependencies

numpy (and pytest for the tests). No model, dataset, service or hardware is used.
