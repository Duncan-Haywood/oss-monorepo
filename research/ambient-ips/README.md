# ambient-ips: does inverse-propensity weighting fix an always-on assistant that learns from its own accept/dismiss feedback?

Track 2 (ambient AI assistant), follow-up to `ambient-bandit`. In that project the assistant refit its model only on windows where it had spoken, a non-random sample. Here the policy speaks with a *known* probability in every window, and each labelled window is weighted by 1/probability. Produced with AI assistance. **Stylised, simulated results only**: every distribution is chosen by me and nothing is a claim about a real user, device or product. The main results are negative or conditional.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/ambient-ips/

## Motivation

`ambient-bandit` listed "debias with inverse-propensity weighting" as its first next step, to test whether the uninformed-prior failure and the drift failure came from learning on a biased sample. Greedy policies have propensity 0 or 1, so weighting needs some randomisation; an epsilon-greedy policy provides it with a known propensity.

## Builds on (and does not claim affiliation with)

- `research/ambient-bandit` in this repository: simulated windows, decision rule and MAP logistic fit, copied into `src/ambient_ips/ips.py` so the project is self-contained.
- Horvitz and Thompson (1952), "A generalization of sampling without replacement from a finite universe", *Journal of the American Statistical Association* 47(260):663&ndash;685, for the idea of weighting a sampled unit by the inverse of its inclusion probability. Idea only; I did not reproduce anything from it.
- Horvitz (1999), "Principles of mixed-initiative user interfaces", CHI '99, 159&ndash;166, <https://doi.org/10.1145/302979.303030>, for the expected-utility speaking rule (idea only).

I checked the Horvitz and Thompson entry's authors, venue, year and volume by web search of the bibliographic record only, not by reading the paper. No research group from `prompt.md` is built on; there is no lab tag.

## Method

World, features, costs (+3 accept, &minus;1 dismiss, &minus;2 when others talk), speaking rule, 10-minute refit and the two priors (uninformed, informed) are as in `ambient-bandit`. Policy: speak if the model says so or a wake phrase is heard (propensity 1); otherwise speak with probability &epsilon; (propensity &epsilon;). The refit uses all windows where it spoke. *none* = unweighted, as in `ambient-bandit`; *ips* = each labelled window weighted by 1/propensity, so exploratory windows carry weight 1/&epsilon;. Under this design the weighted log-likelihood over labelled windows has the same expectation as the log-likelihood over all windows. 20 seeds, 100 h streams. Besides online utility (which includes the cost of exploring), I score each model snapshot at hours 20 and 100 on fresh 100 h held-out streams with no exploration, to separate "what was learned" from "what learning cost".

## Reproduce

```bash
cd research/ambient-ips
PYTHONPATH=src python3 -m pytest -q tests       # 5 tests
PYTHONPATH=src python3 experiments/run.py       # about 200 s, writes experiments/results.txt
```

## Results (all from `experiments/results.txt`; utility per hour, mean &plusmn; std over 20 seeds; oracle 12.71)

| prior | &epsilon; | weighting | online h 20&ndash;100 | dismissals/h | model @100 h, no exploration |
|---|---|---|---|---|---|
| uninformed | 0.002 | none | &minus;1.74 &plusmn; 2.06 | 5.5 | 1.59 &plusmn; 5.70 |
| uninformed | 0.002 | ips | &minus;19.34 &plusmn; 35.15 | 26.3 | &minus;24.77 &plusmn; 52.88 |
| uninformed | 0.005 | none | &minus;2.04 &plusmn; 1.19 | 5.8 | &minus;0.15 &plusmn; 6.29 |
| uninformed | 0.005 | ips | &minus;26.27 &plusmn; 35.52 | 34.8 | &minus;26.89 &plusmn; 57.89 |
| uninformed | 0.020 | none | &minus;23.27 &plusmn; 3.06 | 24.0 | &minus;13.08 &plusmn; 8.66 |
| uninformed | 0.020 | ips | &minus;30.53 &plusmn; 44.04 | 40.3 | &minus;10.87 &plusmn; 57.61 |
| informed | 0.002 | none | 9.65 &plusmn; 0.89 | 9.8 | 10.62 &plusmn; 0.77 |
| informed | 0.002 | ips | 4.46 &plusmn; 13.64 | 10.1 | 6.74 &plusmn; 14.03 |
| informed | 0.005 | none | 8.50 &plusmn; 0.90 | 10.6 | 10.84 &plusmn; 0.81 |
| informed | 0.005 | ips | 6.29 &plusmn; 8.91 | 8.8 | 10.63 &plusmn; 1.96 |
| informed | 0.020 | none | 2.67 &plusmn; 0.89 | 14.8 | 11.42 &plusmn; 0.77 |
| informed | 0.020 | ips | 3.16 &plusmn; 1.03 | 12.4 | 12.23 &plusmn; 0.52 |

Drift (d&prime; 2 &rarr; 1 at hour 50, informed prior, &epsilon; = 0.005), utility per hour over hours 50&ndash;100: stale offline weights 4.38 &plusmn; 0.66; post-drift oracle 5.63 &plusmn; 0.69; online unweighted &minus;0.91 &plusmn; 0.69 (with a 20 h memory &minus;0.26 &plusmn; 0.35); online IPS 0.68 &plusmn; 3.57 (with a 20 h memory &minus;7.79 &plusmn; 13.85).

1. **IPS did not fix the uninformed-prior failure.** Online utility is at or below zero in all six uninformed rows, and the weighted versions are far more variable (std 35 to 44 against 1 to 3). A plausible cause is the weights: at &epsilon; = 0.002 an explored window counts 500 times, so a handful of labelled windows dominate the fit. A 4-seed exploratory run with weights clipped at 20 (not in `experiments/run.py`, not reported in the table) did not help either, but I did not explore clipping levels or self-normalisation.
2. **Exploration costs more than it teaches, in this world.** With an informed prior, the unweighted online policy earns most at the smallest &epsilon; (9.65 at 0.002 against 2.67 at 0.02), although the model it learns is no better at 0.02 (11.42 against 10.62). A likely reason, not tested further: at &epsilon; = 0.02 about 7 of the 360 hourly windows are explored and nearly all of them are dismissed.
3. **Only one cell favours IPS.** With the informed prior and &epsilon; = 0.02 the weighted model is closer to the oracle (12.23 &plusmn; 0.52 against 11.42 &plusmn; 0.77 at 100 h), and its online utility is similar (3.16 against 2.67). Both are far below the 9.65 of the unweighted &epsilon; = 0.002 policy, so a deployed assistant would not choose this setting. I ran 12 cells and did not correct for multiple comparisons; treat this as suggestive, not established. That the unweighted model is near the oracle at all suggests the selection bias matters little with these features, but I did not test that directly.
4. **Drift (negative).** Neither weighting nor a 20 h memory brings the bandit near the stale offline weights (4.38). IPS with memory is the worst row (&minus;7.79 &plusmn; 13.85), consistent with weights on a short window being very noisy. I did not find out why the unweighted bandit is also below stale weights, a result inherited from `ambient-bandit`.

## Limitations

- Same stylised world as `ambient-bandit`: independent windows, instant noise-free accept/dismiss, a model with the true functional form, benefit and costs chosen by me.
- One exploration scheme (constant &epsilon;), one weight form (raw 1/propensity). Decaying &epsilon;, clipped or self-normalised weights, doubly robust estimators and Thompson exploration were not evaluated.
- Propensities are known exactly here. In a real system they would depend on the deployed model and context and be harder to log correctly.
- The held-out score uses the oracle's rule on streams from the same world.

## Next steps

- Clipped, self-normalised and doubly robust weights, and a decaying &epsilon;, at equal exploration cost.
- Test directly whether the selection bias hurts: compare the weighted and unweighted fits to the full-information fit on the same labelled windows.
- Real accept/dismiss logs, if the owner opts in to collecting them.

## Outside dependencies

numpy (and pytest for the tests). No model, dataset, service or hardware is used.
