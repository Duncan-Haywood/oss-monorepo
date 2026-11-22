# ambient-fullinfo: does selection bias actually hurt an always-on assistant that learns from its own accept/dismiss feedback?

Track 2 (ambient AI assistant), follow-up to `ambient-ips`, whose second "next step" was to test the selection bias directly. Produced with AI assistance. **Stylised, simulated results only**: every distribution is chosen by me and nothing is a claim about a real user, device or product.

**Live page:** https://marisstella.app/research/ambient-fullinfo/

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
PYTHONPATH=src python3 -m pytest -q tests       # 8 tests
PYTHONPATH=src python3 experiments/run.py       # about 6 min, writes experiments/results.txt
```

## Results (all from `experiments/results.txt`; held-out utility per hour, mean &plusmn; std over 20 seeds; oracle 12.71)

> **Corrected 2026-11-22 (quality round 94).** An earlier version of this section reported that the biased fit "fails entirely" with the uninformed prior and that IPS weights end up thousands away from the oracle. Both were optimizer failures, not selection bias or IPS variance: `fit_map` took 40 undamped Newton steps, and from the uninformed start it diverged, returning weights whose MAP objective was 450 to 360,000 times the minimum ([audit](../../portfolio/quality/audits/2026-11-22-ambient-fullinfo.json)). `fit_map` is now a damped Newton (each step is halved until the objective falls). An independent line-searched solver gives the same objective on every checked fit, and the table below was regenerated with it.

Fits at hour 100:

| prior | &epsilon; | biased | ips | full | labelled windows |
|---|---|---|---|---|---|
| uninformed | 0.002 | 10.63 &plusmn; 0.77 | 9.61 &plusmn; 4.44 | 12.72 &plusmn; 0.58 | 1685 |
| uninformed | 0.005 | 10.85 &plusmn; 0.79 | 11.15 &plusmn; 1.51 | 12.72 &plusmn; 0.58 | 1757 |
| uninformed | 0.020 | 11.44 &plusmn; 0.78 | 12.36 &plusmn; 0.57 | 12.72 &plusmn; 0.58 | 2174 |
| informed | 0.002 | 10.62 &plusmn; 0.77 | 9.65 &plusmn; 4.50 | 12.72 &plusmn; 0.58 | 1688 |
| informed | 0.005 | 10.84 &plusmn; 0.81 | 11.14 &plusmn; 1.49 | 12.72 &plusmn; 0.58 | 1757 |
| informed | 0.020 | 11.42 &plusmn; 0.77 | 12.36 &plusmn; 0.56 | 12.72 &plusmn; 0.58 | 2178 |

1. **The selection bias costs about 1.3 to 2.1 utility per hour, contrary to the guess in `ambient-ips`.** The full-information fit reaches the oracle (12.72 against 12.71) at every setting and from hour 20, with weights within 0.32 of the oracle's. The biased fit stays at 10.5 to 11.4 with either prior, and its weights sit 2.2 to 2.7 from the oracle's at hours 20, 50 and 100: more data does not shrink the gap, which is what bias rather than noise looks like. The prior barely matters once a few hundred windows are labelled (rows agree within 0.1). The earlier guess confused "close to the oracle on utility" with "unbiased".
2. **Weighting recovers part of the loss, and only with enough exploration.** At &epsilon; = 0.02, IPS closes most of the gap (12.36 against 11.43 biased, distance to the oracle 0.83 against 2.16). At &epsilon; = 0.005 it is about level with the biased fit (11.15 against 10.85, std 1.5). At &epsilon; = 0.002 it is worse and far noisier (9.6 &plusmn; 4.5 at hour 100, 2.8 &plusmn; 26 at hour 20). The raw weights (up to 1/&epsilon; = 500) are the likely cause; I did not test clipping or self-normalisation here.
3. **What this does not show.** The gap to *full* is partly selection bias and partly 360 labels per hour against a few per hour. I did not build a control with the same number of random-sample labels, so I cannot say how much of the gap is bias. An assistant could never get the *full* labels in any case; the figure is a ceiling.

### Builds on, from the literature (added 2026-11-22)

The setting is learning from logged bandit feedback. The relevant prior work is covariate shift and importance weighting (Shimodaira 2000, *J. Statistical Planning and Inference* 90(2):227&ndash;244), learning from logged implicit exploration data (Strehl, Langford, Li and Kakade, NeurIPS 2010), doubly robust policy evaluation (Dud&iacute;k, Langford and Li, ICML 2011) and counterfactual risk minimisation (Swaminathan and Joachims, JMLR 2015), which addresses the variance of raw IPS weights seen in result 2. Citations are from the bibliographic records, not re-read for this note. Nothing here is new to that literature; the contribution is a measured size of the effect in this stylised assistant world.

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
