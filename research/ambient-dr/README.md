# ambient-dr: does a doubly robust estimator fix learning from an assistant's own self-selected feedback?

Track 2 (ambient AI assistant), follow-up to `ambient-labelmatch`, whose first next step was "doubly robust weights on the same logged history". Produced with AI assistance. **Stylised, simulated results only**: every distribution is chosen by me and nothing is a claim about a real user, device or product. **Negative result.**

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/ambient-dr/

## Motivation

`ambient-labelmatch` showed that the gap between a model fitted on windows where the assistant spoke and one fitted on all windows is mostly selection bias, and that raw inverse-propensity (IPS) weights are unstable while capped weights help only with an informed prior. A doubly robust (DR) estimator is the standard next candidate: it combines an outcome model with an IPS correction and is consistent if either is right. Does it help here?

## Builds on (and does not claim affiliation with)

- `research/ambient-labelmatch`, `ambient-fullinfo`, `ambient-ips`, `ambient-bandit` in this repository: simulated windows, decision rule, &epsilon;-greedy policy and MAP logistic fit, copied into `src/ambient_dr/core.py` so the project is self-contained.
- The doubly robust idea for missing outcomes and off-policy evaluation: Robins, Rotnitzky and Zhao (1994), "Estimation of regression coefficients when some regressors are not always observed", *Journal of the American Statistical Association* 89(427):846&ndash;866; Dud&iacute;k, Langford and Li (2011), "Doubly robust policy evaluation and learning", ICML. I checked these two against the bibliographic record only and cite no specific result from them; the pseudo-label form below is my own adaptation of the idea to a logistic fit, not a reproduction of either paper.

No research group from `prompt.md` is built on; there is no lab tag.

## Method

Same world, policy and scoring as `ambient-labelmatch` (fits at hour 100; 20 seeds; &epsilon; &isin; {0.002, 0.005, 0.02}; two priors; scored on 20 fresh 100 h held-out streams without exploration). For every window i so far, the pseudo-label is

&nbsp;&nbsp;&nbsp;&nbsp;ŷ<sub>i</sub> = m(x<sub>i</sub>) + (S<sub>i</sub>/&pi;<sub>i</sub>) (y<sub>i</sub> &minus; m(x<sub>i</sub>)),

where S<sub>i</sub> = 1 if the assistant spoke (label observed), &pi;<sub>i</sub> is its known propensity and m is an outcome model. A MAP logistic fit with the same prior is then made on all windows with soft targets ŷ. Three outcome models: **dr_biased** (the deployed biased fit), **dr_clip10** (the clip10 fit) and **dr_prior** (the prior weights alone). The other columns are as in `ambient-labelmatch`.

## Reproduce

```bash
cd research/ambient-dr
PYTHONPATH=src python3 -m pytest -q tests       # 5 tests
PYTHONPATH=src python3 experiments/run.py       # about 2 minutes, writes experiments/results.txt
```

## Results (from `experiments/results.txt`; held-out utility per hour, mean over 20 seeds; oracle 12.71)

| prior | &epsilon; | biased | ips | clip10 | selfnorm | dr_biased | dr_clip10 | dr_prior | random_matched |
|---|---|---|---|---|---|---|---|---|---|
| uninformed | 0.002 | 1.59 | &minus;23.80 | &minus;33.17 | &minus;11.97 | &minus;40.53 | &minus;48.77 | &minus;39.93 | 12.15 |
| uninformed | 0.005 | &minus;0.15 | &minus;32.73 | &minus;62.95 | 5.44 | &minus;54.12 | &minus;15.89 | &minus;59.04 | 12.18 |
| uninformed | 0.020 | &minus;13.08 | &minus;45.55 | &minus;96.19 | &minus;38.68 | &minus;47.24 | &minus;49.54 | &minus;47.74 | 12.52 |
| informed | 0.002 | 10.62 | 9.73 | 11.70 | 10.01 | &minus;9.66 | 0.26 | 0.90 | 12.48 |
| informed | 0.005 | 10.84 | 11.14 | 12.15 | 11.60 | 10.74 | 11.00 | 10.92 | 12.49 |
| informed | 0.020 | 11.42 | 12.36 | 12.52 | 12.45 | 12.24 | 12.35 | 12.34 | 12.48 |

The biased, ips, clip10, selfnorm and random_matched columns reproduce `ambient-labelmatch` exactly (same seeds). Standard deviations are in `results.txt`.

1. **No benefit from DR in this world.** With the uninformed prior every DR variant is worse than the biased fit at all three &epsilon; (for example &minus;40.5 against 1.6 at &epsilon; = 0.002), with standard deviations of tens of utility per hour in `results.txt`, so only the sign is reliable.
2. **Informed prior, rare exploration: DR is the worst fit.** At &epsilon; = 0.002 the DR fits score &minus;9.7 to 0.9 against 10.6 for biased. At &epsilon; = 0.005 they are level with biased (10.7 to 11.0 against 10.8) and below clip10 (12.15); at &epsilon; = 0.02 they are between biased (11.42) and clip10 (12.52).
3. **Likely cause (not tested).** The correction term (S/&pi;)(y &minus; m) puts a residual of size up to 1/&epsilon; = 500 on the rare explored windows, and these are used as soft targets in a logistic fit, so a few windows dominate the gradient. Clipping the correction, or fitting the outcome model on a held-out split, are the obvious next tests; I did not try either.

## Limitations

- Same stylised world as `ambient-fullinfo`: independent windows, instant noise-free feedback, a model with the true functional form, costs chosen by me.
- Fits are off-policy on the history of one deployed learner, not online loops; one hour (100), one prevalence, 20 seeds, large variance for the uninformed prior.
- The DR form is a pseudo-label adaptation, not a tuned estimator: no clipping, cross-fitting or self-normalisation. The negative result is about this form only.

## Next steps

- Clipped and cross-fitted DR pseudo-labels; test the 1/&epsilon; explanation by capping the correction.
- Real accept/dismiss logs, if the owner opts in to collecting them.

## Outside dependencies

numpy (and pytest for the tests). No model, dataset, service or hardware is used.
