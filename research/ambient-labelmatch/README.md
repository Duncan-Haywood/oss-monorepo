# ambient-labelmatch: is the gap from learning on self-selected feedback bias or too few labels, and do clipped or normalised weights close it?

Track 2 (ambient AI assistant), follow-up to `ambient-fullinfo`, whose first two "next steps" were a label-matched control and clipped or self-normalised weights. Produced with AI assistance. **Stylised, simulated results only**: every distribution is chosen by me and nothing is a claim about a real user, device or product.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/ambient-labelmatch/

## Motivation

`ambient-fullinfo` found that a model fitted on every window's label reaches the oracle, while the model fitted only on windows where the assistant spoke does not. But the full-information fit had about 360 labels per hour against a few per hour, so that gap mixes selection bias with data volume. It also suspected, without testing, that the raw 1/&epsilon; weights were what made IPS unstable. Here I test both.

## Builds on (and does not claim affiliation with)

- `research/ambient-fullinfo`, `research/ambient-ips` and `research/ambient-bandit` in this repository: simulated windows, decision rule, &epsilon;-greedy policy and MAP logistic fit, copied into `src/ambient_labelmatch/core.py` so the project is self-contained.
- Horvitz and Thompson (1952), *Journal of the American Statistical Association* 47(260):663&ndash;685, for inverse-propensity weighting; self-normalised weights follow the H&aacute;jek-style idea of dividing by the weight total (ideas only; I checked the Horvitz&ndash;Thompson citation against the bibliographic record only, as in `ambient-ips`, and cite no specific result from the paper).
- Horvitz (1999), "Principles of mixed-initiative user interfaces", CHI '99, 159&ndash;166, <https://doi.org/10.1145/302979.303030>, for the expected-utility speaking rule (idea only).

No research group from `prompt.md` is built on; there is no lab tag.

## Method

Same world, deployed policy and held-out scoring as `ambient-fullinfo` (speak if the model says so or a wake phrase is heard; otherwise speak with probability &epsilon;; refit every 10 minutes on windows where it spoke, unweighted). At hour 100 I fit seven models on the same history with the same prior and prior precision:

- **biased**, **ips**, **full**: as in `ambient-fullinfo`;
- **clip10**, **clip50**: IPS with each weight capped at 10 or 50;
- **selfnorm**: IPS weights divided by their mean;
- **random_matched**: a uniformly random subset of *all* windows so far, of the same size as the number of windows where the policy spoke. A real assistant cannot observe labels of windows where it stayed silent, so this is a diagnostic control, not a deployable method.

Scored by utility per hour on 20 fresh 100 h held-out streams with no exploration, and by L2 distance of the weights to the oracle weights. Two priors, &epsilon; &isin; {0.002, 0.005, 0.02}, 20 seeds. The biased, ips and full rows reproduce `ambient-fullinfo`'s hour-100 rows exactly (same seeds).

## Reproduce

```bash
cd research/ambient-labelmatch
PYTHONPATH=src python3 -m pytest -q tests       # 4 tests
PYTHONPATH=src python3 experiments/run.py       # a few minutes, writes experiments/results.txt
```

## Results (from `experiments/results.txt`; held-out utility per hour, mean &plusmn; std over 20 seeds; oracle 12.71)

| prior | &epsilon; | labels | biased | ips | clip10 | clip50 | selfnorm | random_matched | full |
|---|---|---|---|---|---|---|---|---|---|
| uninformed | 0.002 | 814 | 1.59 | &minus;23.80 | &minus;33.17 | &minus;58.26 | &minus;11.97 | 12.15 | 12.72 |
| uninformed | 0.005 | 932 | &minus;0.15 | &minus;32.73 | &minus;62.95 | &minus;64.43 | 5.44 | 12.18 | 12.72 |
| uninformed | 0.020 | 2691 | &minus;13.08 | &minus;45.55 | &minus;96.19 | &minus;45.55 | &minus;38.68 | 12.52 | 12.72 |
| informed | 0.002 | 1688 | 10.62 | 9.73 | 11.70 | 12.07 | 10.01 | 12.48 | 12.72 |
| informed | 0.005 | 1757 | 10.84 | 11.14 | 12.15 | 12.30 | 11.60 | 12.49 | 12.72 |
| informed | 0.020 | 2178 | 11.42 | 12.36 | 12.52 | 12.36 | 12.45 | 12.48 | 12.72 |

Standard deviations are in `results.txt`; for the uninformed prior the weighted fits have stds of 20 to 90, so their means are unreliable.

1. **Mostly selection bias, not label volume, in this world.** With the same number of labels, a random sample of windows gets 12.15 to 12.52 utility per hour (weights within 0.65 to 1.21 of the oracle's), against 1.59 to &minus;13.08 for the biased fit with the uninformed prior and 10.6 to 11.4 with the informed one. The remaining gap from random_matched to full (up to 0.57) is the effect of having 13 to 44 times more labels (36,000 windows against 814 to 2,691). This corrects the open question in `ambient-fullinfo`, whose gap was partly volume.
2. **Clipping helps only when the prior is informed.** With the informed prior, clip10 beats both biased and raw IPS in every row (for example 12.15 against 10.84 and 11.14 at &epsilon; = 0.005), and so does clip50 except at &epsilon; = 0.02, where it equals raw IPS and at &epsilon; = 0.02 clip10 (12.52) is level with random_matched (12.48), within noise. With the uninformed prior every clipped fit is worse than biased (clip10 between &minus;33 and &minus;96). The raw-weight hypothesis in `ambient-fullinfo` is only partly right: weights up to 500 hurt, but removing the extremes does not help when the starting point is bad. clip50 at &epsilon; = 0.02 is identical to raw IPS because the largest weight is 1/0.02 = 50.
3. **Self-normalisation is inconsistent.** It is the best weighted fit for the uninformed prior at &epsilon; = 0.002 and 0.005 on weight distance (23 and 32, against thousands for IPS), but its utility is noisy (stds 23 to 80) and it is negative at two of three uninformed settings. With the informed prior it is below the clipped fits and not reliably better than biased (10.01 against 10.62 at &epsilon; = 0.002).
4. **What this does not show.** random_matched needs labels the assistant would never see, so it says where the loss comes from, not how to recover it. With feedback only on windows where it spoke, the best rows here are informed-prior clipped fits; I did not test why they work or whether the cap should be tuned.

## Limitations

- Same stylised world as `ambient-fullinfo`: independent windows, instant noise-free accept/dismiss, a model with the true functional form, costs and benefit chosen by me.
- The IPS-family fits are evaluated off-policy on the history of one deployed (unweighted) learner, not as their own online loops.
- One hour (100), one prevalence (3%), caps 10 and 50 only, 20 seeds; large stds for the uninformed prior.
- No doubly robust estimator.

## Next steps

- Doubly robust weights (outcome model plus IPS correction) on the same logged history.
- Run clipped and self-normalised weights as online learners (as `ambient-ips` did for raw IPS) and tune the cap with held-out logged data.
- Real accept/dismiss logs, if the owner opts in to collecting them.

## Outside dependencies

numpy (and pytest for the tests). No model, dataset, service or hardware is used.
