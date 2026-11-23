# ambient-ips: does inverse-propensity weighting fix an always-on assistant that learns from its own accept/dismiss feedback?

Track 2 (ambient AI assistant), follow-up to `ambient-bandit`. In that project the assistant refit its model only on windows where it had spoken, a non-random sample. Here the policy speaks with a *known* probability in every window, and each labelled window is weighted by 1/probability. Produced with AI assistance. **Stylised, simulated results only**: every distribution is chosen by me and nothing is a claim about a real user, device or product. The main results are negative or conditional. Corrected 2026-11-23: the uninformed-prior and drift failures first reported were a solver divergence (see Results).

**Live page:** https://marisstella.app/research/ambient-ips/

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
PYTHONPATH=src python3 -m pytest -q tests       # 6 tests
PYTHONPATH=src python3 experiments/run.py       # about 200 s, writes experiments/results.txt
```

## Results (all from `experiments/results.txt`; utility per hour, mean &plusmn; std over 20 seeds; oracle 12.71)

**Corrected 2026-11-23** (quality audit round 103, `portfolio/quality/audits/2026-11-23-ambient-ips.json`). The first version used undamped Newton steps in `fit_map`; 9 of the 24 hour-100 fits never converged (objective 450 to 380,000 times the minimum), all six uninformed unweighted cells and three IPS cells among them. That divergence, not the weighting, produced the "uninformed-prior failure" and the drift "worst row" reported before. The fit now uses the damped Newton of `ambient-fullinfo` (PR #18259) and the table is rerun with the same seeds. Results 1 and 4 changed; 2 and 3 held.

| prior | &epsilon; | weighting | online h 20&ndash;100 | dismissals/h | model @100 h, no exploration |
|---|---|---|---|---|---|
| uninformed | 0.002 | none | 9.65 &plusmn; 0.88 | 9.8 | 10.63 &plusmn; 0.77 |
| uninformed | 0.002 | ips | 7.79 &plusmn; 3.74 | 8.2 | 9.62 &plusmn; 3.33 |
| uninformed | 0.005 | none | 8.48 &plusmn; 0.88 | 10.6 | 10.85 &plusmn; 0.79 |
| uninformed | 0.005 | ips | 8.13 &plusmn; 1.71 | 7.7 | 10.73 &plusmn; 1.80 |
| uninformed | 0.020 | none | 2.65 &plusmn; 0.88 | 14.8 | 11.44 &plusmn; 0.78 |
| uninformed | 0.020 | ips | 3.17 &plusmn; 1.03 | 12.3 | 12.25 &plusmn; 0.50 |
| informed | 0.002 | none | 9.65 &plusmn; 0.89 | 9.8 | 10.62 &plusmn; 0.77 |
| informed | 0.002 | ips | 7.81 &plusmn; 3.72 | 8.2 | 9.62 &plusmn; 3.36 |
| informed | 0.005 | none | 8.50 &plusmn; 0.90 | 10.6 | 10.84 &plusmn; 0.81 |
| informed | 0.005 | ips | 8.18 &plusmn; 1.64 | 7.7 | 10.75 &plusmn; 1.79 |
| informed | 0.020 | none | 2.67 &plusmn; 0.89 | 14.8 | 11.42 &plusmn; 0.77 |
| informed | 0.020 | ips | 3.16 &plusmn; 1.03 | 12.4 | 12.23 &plusmn; 0.52 |

Drift (d&prime; 2 &rarr; 1 at hour 50, informed prior, &epsilon; = 0.005), utility per hour over hours 50&ndash;100: stale offline weights 4.38 &plusmn; 0.66; post-drift oracle 5.63 &plusmn; 0.69; online unweighted &minus;0.91 &plusmn; 0.69 (with a 20 h memory &minus;0.26 &plusmn; 0.35); online IPS 1.34 &plusmn; 1.35 (with a 20 h memory &minus;0.18 &plusmn; 2.16).

1. **There is no uninformed-prior failure once the fit converges.** Every uninformed row is within 0.05 of the matching informed row; 100 hours of data swamp the prior. The earlier finding that IPS "did not fix" it was a solver artifact. What remains is the known inverse-propensity trade-off: at &epsilon; = 0.002 an explored window counts 500 times, and the weighted online utility is lower and noisier (7.79 &plusmn; 3.74 against 9.65 &plusmn; 0.88).
2. **Exploration costs more than it teaches, in this world.** The unweighted online policy earns most at the smallest &epsilon; (9.65 at 0.002 against 2.67 at 0.02), although the model it learns is better at 0.02 (11.42 against 10.62). A likely reason, not tested further: at &epsilon; = 0.02 about 7 of the 360 hourly windows are explored and nearly all of them are dismissed.
3. **Weighting helps the learned model only at the largest &epsilon;.** At &epsilon; = 0.02 the weighted model is closer to the oracle (12.23 &plusmn; 0.52 against 11.42 &plusmn; 0.77 at 100 h, either prior), with similar online utility (3.16 against 2.67), both far below the 9.65 of the unweighted &epsilon; = 0.002 policy. 12 cells, no multiple-comparison correction: suggestive, not established. The selection bias is real: `ambient-fullinfo` measured the unweighted fit losing 1.3 to 2.1 utility per hour against a full-information fit.
4. **Drift (negative).** Neither weighting nor a 20 h memory brings the bandit near the stale offline weights (4.38). IPS without memory is the best online row (1.34 &plusmn; 1.35); with a 20 h memory it is &minus;0.18 &plusmn; 2.16, no worse than unweighted (&minus;0.26). Why every online variant is below the stale weights is not explained here.

**Prior work this reproduces rather than extends.** Asking for a label with a known probability and weighting it by the inverse is importance-weighted active learning (Beygelzimer, Dasgupta and Langford, "Importance weighted active learning", ICML 2009) and learning from logged bandit feedback (Strehl, Langford, Li and Kakade, "Learning from logged implicit exploration data", NeurIPS 2010; Swaminathan and Joachims, "Counterfactual risk minimization", JMLR 2015). The variance at small &epsilon; is the known cost of those estimators, and truncated weights (Ionides, "Truncated importance sampling", JCGS 2008) are the standard remedy, not evaluated here. Citations from bibliographic memory, checked against nothing in this session.

## Limitations

- Same stylised world as `ambient-bandit`: independent windows, instant noise-free accept/dismiss, a model with the true functional form, benefit and costs chosen by me.
- One exploration scheme (constant &epsilon;), one weight form (raw 1/propensity). Decaying &epsilon;, clipped or self-normalised weights, doubly robust estimators and Thompson exploration were not evaluated.
- Propensities are known exactly here. In a real system they would depend on the deployed model and context and be harder to log correctly.
- The held-out score uses the oracle's rule on streams from the same world.

## Next steps

- Clipped, self-normalised and doubly robust weights, and a decaying &epsilon;, at equal exploration cost.
- Real accept/dismiss logs, if the owner opts in to collecting them.

## Outside dependencies

numpy (and pytest for the tests). No model, dataset, service or hardware is used.
