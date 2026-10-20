# ambient-fullinfo: does selection bias actually hurt an always-on assistant that learns from its own accept/dismiss feedback?

Track 2 (ambient AI assistant), follow-up to `ambient-ips`, whose second "next step" was to test the selection bias directly. Produced with AI assistance. **Stylised, simulated results only**: every distribution is chosen by me and nothing is a claim about a real user, device or product.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/ambient-fullinfo/

## Motivation

`ambient-ips` noted that the unweighted model came close to the oracle in one setting and guessed that "the selection bias matters little with these features", without testing it. Here I test it: on the same logged history, fit the model three ways and score each on fresh held-out streams.

## Builds on (and does not claim affiliation with)

- `research/ambient-ips` and `research/ambient-bandit` in this repository: simulated windows, decision rule, epsilon-greedy policy and MAP logistic fit, copied into `src/ambient_fullinfo/core.py` so the project is self-contained.
- Horvitz and Thompson (1952), *Journal of the American Statistical Association* 47(260):663&ndash;685, for inverse-propensity weighting (idea only; citation checked against the bibliographic record only, as in `ambient-ips`).
- Horvitz (1999), "Principles of mixed-initiative user interfaces", CHI '99, 159&ndash;166, <https://doi.org/10.1145/302979.303030>, for the expected-utility speaking rule (idea only).

No research group from `prompt.md` is built on; there is no lab tag.

## Method

The deployed policy is the one from `ambient-ips` (speak if the model says so or a wake phrase is heard; otherwise speak with probability &epsilon;), refit every 10 minutes on the windows where it spoke, unweighted. At hours 20, 50 and 100 I fit three models on that same history, with the same prior and prior precision:

- **biased**: unweighted, windows where it spoke (what the deployed learner sees);
- **ips**: the same windows, weighted 1/propensity;
- **full**: *every* window so far with its true label. A real assistant never sees the label of a window where it stayed silent, so this is an oracle-data reference, not something one could deploy. It also has far more labels (360 per hour) than the other two (hundreds to a few thousand in total), so the comparison mixes selection bias with data volume.

Each fit is scored by its utility per hour on 20 fresh 100 h held-out streams with no exploration, and by the L2 distance of its weights to the oracle weights (a 2000 h fit). Two priors (uninformed, informed), &epsilon; &isin; {0.002, 0.005, 0.02}, 20 seeds.

## Reproduce

```bash
cd research/ambient-fullinfo
PYTHONPATH=src python3 -m pytest -q tests       # 4 tests
PYTHONPATH=src python3 experiments/run.py       # about 6 min, writes experiments/results.txt
```

## Results (all from `experiments/results.txt`; held-out utility per hour, mean &plusmn; std over 20 seeds; oracle 12.71)

Fits at hour 100:

| prior | &epsilon; | biased | ips | full | labelled windows |
|---|---|---|---|---|---|
| uninformed | 0.002 | 1.59 &plusmn; 5.70 | &minus;23.80 &plusmn; 50.17 | 12.72 &plusmn; 0.58 | 814 |
| uninformed | 0.005 | &minus;0.15 &plusmn; 6.29 | &minus;32.73 &plusmn; 60.24 | 12.72 &plusmn; 0.58 | 932 |
| uninformed | 0.020 | &minus;13.08 &plusmn; 8.66 | &minus;45.55 &plusmn; 85.65 | 12.72 &plusmn; 0.58 | 2691 |
| informed | 0.002 | 10.62 &plusmn; 0.77 | 9.73 &plusmn; 4.38 | 12.72 &plusmn; 0.58 | 1688 |
| informed | 0.005 | 10.84 &plusmn; 0.81 | 11.14 &plusmn; 1.49 | 12.72 &plusmn; 0.58 | 1757 |
| informed | 0.020 | 11.42 &plusmn; 0.77 | 12.36 &plusmn; 0.56 | 12.72 &plusmn; 0.58 | 2178 |

1. **The selection bias is large here, contrary to the guess in `ambient-ips`.** The full-information fit reaches the oracle (12.72 against 12.71) at every setting and from hour 20, with weights within 0.3 of the oracle's. The biased fit loses 1.3 to 2.1 utility per hour with the informed prior (10.6 to 11.4) and fails entirely with the uninformed one, where its weights end up 179 to 658 away from the oracle's and get *worse* with more hours (55 at hour 20 to 179 at hour 100 for &epsilon; = 0.002). The earlier guess confused "close to the oracle on utility" with "unbiased".
2. **Weighting recovers part of the loss, and only in one regime.** With the informed prior, IPS closes most of the gap at &epsilon; = 0.02 (12.36 against 11.42 biased, with distance to the oracle 0.83 against 2.15) but is no better, and far noisier, at &epsilon; = 0.002 (9.73 &plusmn; 4.38). With the uninformed prior it is worse than the biased fit in every row, with a std of 50 to 86 and weight distances in the thousands. The raw weights (up to 1/&epsilon; = 500) are the likely cause; I did not test clipping or self-normalisation here.
3. **What this does not show.** The gap to *full* is partly selection bias and partly 360 labels per hour against a few per hour. I did not build a control with the same number of random-sample labels, so I cannot say how much of the gap is bias. An assistant could never get the *full* labels in any case; the figure is a ceiling.

## Limitations

- Same stylised world as `ambient-bandit`: independent windows, instant noise-free accept/dismiss, a model with the true functional form, benefit and costs chosen by me.
- Only one deployed learner (unweighted) generates the history; the IPS fit is evaluated off-policy on that history, not as its own online loop (`ambient-ips` did that).
- No label-matched random-sample control (see result 3). No clipping, self-normalisation or doubly robust variants.
- Held-out score uses the oracle's rule on streams from the same world.

## Next steps

- A label-matched control: fit on a uniformly random subset of windows with as many labels as the biased fit has, to isolate bias from data volume.
- Clipped, self-normalised and doubly robust weights on the same logged history.
- Real accept/dismiss logs, if the owner opts in to collecting them.

## Outside dependencies

numpy (and pytest for the tests). No model, dataset, service or hardware is used.
