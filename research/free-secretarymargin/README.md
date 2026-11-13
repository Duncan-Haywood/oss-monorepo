# free-secretarymargin: with noisy scores, how close do a margin rule and the best cutoff come to the Bayes-optimal secretary policy?

**Update, 2026-11-13: the Bayes step.** The question this project ended on was how much of the gap to the optimal policy the margin rule closes. Answer: very little, because the big gap is not about the rule's shape but about knowing the score distribution. A policy that uses the model (quality ~ N(0,1), noise &sigma; known) and the whole score history, fitted by regression Monte Carlo (Longstaff&ndash;Schwartz) on 20,000 training trials and scored on the *same* 60,000 test trials as the rules below, picks the true best with probability **0.589 / 0.382 / 0.220 / 0.103** at noise &sigma; = 0 / 0.5 / 1 / 2, against 0.376 / 0.244 / 0.149 / 0.076 for the best margin rule (paired gains +0.213, +0.137, +0.070, +0.027, standard errors 0.001 to 0.003). The margin rule closes only 6% to 8% of the gap from the cutoff rule to this policy. A clairvoyant who sees every noisy score first gets 1 / 0.509 / 0.274 / 0.122, an upper bound on any online policy, so the Bayes policy reaches 75% to 85% of it with noise. Check: with no noise the problem is Gilbert and Mosteller's full-information secretary problem, whose optimal rule is known exactly; on the same test trials it scores 0.5893 and the fitted policy 0.5888. **The catch is robustness:** rank-only rules need no model, and a Bayes policy fitted under the wrong one can do worse than them (assume twice the true noise: 0.111 vs 0.143 for the cutoff rule; believe quality is half as spread as it is: 0.214 vs 0.233). Details in "The Bayes step" below.

**Why this was worth doing (the margin step).** `free-secretarynoise` ended on a question: its best cutoff rule is only one family, so how much is left on the table? A first cheap step is a two-parameter rule that asks for a *margin*: after skipping r&minus;1 candidates, take the first whose noisy score beats the earlier maximum by at least d. When scores are noisy a barely-better record is weak evidence that it is the true best, so a margin should help. **Result (simulation, n = 50, parameters tuned on 8,000 training trials, scored on 60,000 fresh paired trials):** a small, real gain at moderate noise and none at high noise. P(pick the true best) rises from 0.2334 to 0.2444 at noise 0.5 (+0.0111, standard error 0.0014) and from 0.1429 to 0.1491 at noise 1 (+0.0062, se 0.0015); at noise 2 the gain is +0.0018 (se 0.0011), not distinguishable from zero; with no noise the tuning picks d = 0, the plain cutoff. Produced with AI assistance (Claude).

**Live page:** https://marisstella.app/research/free-secretarymargin/

**Builds on.** Gilbert and Mosteller (1966), "Recognizing the maximum of a sequence", *JASA* 61(313), for the full-information thresholds (cited from memory; b<sub>1</sub> = 1/2 is checked analytically in the tests, and b<sub>2</sub>, b<sub>3</sub> against the table values as remembered); Longstaff and Schwartz (2001), *Review of Financial Studies* 14(1), for regression Monte Carlo stopping. Also `research/free-secretarynoise` (same model and noise definition) and the classical cutoff rule (Lindley 1961; Ferguson 1989, *Statistical Science* 4(3); cited from memory, not re-verified: no bibliographic service was reachable from this session). No CU Boulder group's work is built on or implied; the link to the digital-twin theme is the analogy of a noisy screening score.

## Model and rule
True quality q<sub>i</sub> ~ N(0,1) iid; observed x<sub>i</sub> = q<sub>i</sub> + &sigma;&epsilon;<sub>i</sub>. Margin rule (r, d): skip candidates 1 to r&minus;1, then take the first later candidate with x<sub>i</sub> greater than the earlier observed maximum plus d&middot;&radic;(1+&sigma;<sup>2</sup>) (d in units of the observed-score sd); if none qualifies, take the last. d = 0 is the cutoff rule. Success means the pick has the largest true quality.

Method: for each noise level, grid-search r in 8..30 and d in {0, 0.1, 0.2, 0.4, 0.7, 1.0} (the cutoff rule is the d = 0 row) on training trials (seed 11), then score the winning margin rule and the winning cutoff rule on fresh trials (seed 12) and report the paired difference with its standard error.

## Reproduce
```bash
cd research/free-secretarymargin
python3 -m unittest discover -s tests -v     # 12 tests (7 need numpy)
python3 experiments/run.py                   # about 25 s, stdlib only
python3 experiments/figure.py                # stdlib only
python3 experiments/run_bayes.py             # Bayes step: about 15 minutes, needs numpy
python3 experiments/figure_bayes.py          # stdlib only
```
The Bayes tests (`tests/test_secretary_bayes.py`, 7) skip when numpy is absent.

## Results
`experiments/results.txt`, `experiments/results.json`, `experiments/margin_vs_cutoff.svg`.

| noise &sigma; | best cutoff r | best margin (r, d) | test P(best), cutoff | test P(best), margin | gain (se) |
|---|---|---|---|---|---|
| 0 | 20 | (20, 0) | 0.3756 | 0.3756 | 0 (same rule) |
| 0.5 | 15 | (14, 0.2) | 0.2334 | 0.2444 | +0.0111 (0.0014) |
| 1 | 15 | (10, 0.4) | 0.1429 | 0.1491 | +0.0062 (0.0015) |
| 2 | 11 | (9, 0.4) | 0.0742 | 0.0760 | +0.0018 (0.0011) |

Check: the noiseless simulation agrees with the exact formula in the tests (n = 20, r = 8: 0.384). The tuned cutoffs here (15 at noise 0.5 and 1, from 8,000 training trials) are noisier than `free-secretarynoise`'s 40,000-trial 16 to 17.

## The Bayes step (2026-11-13)
**Model knowledge.** Given x<sub>i</sub>, q<sub>i</sub> | x<sub>i</sub> ~ N(x<sub>i</sub>/(1+&sigma;<sup>2</sup>), &sigma;<sup>2</sup>/(1+&sigma;<sup>2</sup>)), independent across candidates. After t candidates, `secretary_bayes.py` keeps G<sub>t</sub>(q) = &prod;<sub>j&lt;t</sub> P(q<sub>j</sub> &lt; q | x<sub>j</sub>) on a 481-point grid and computes exactly (up to quadrature) two numbers: p<sub>t</sub> = P(candidate t is the true best | x<sub>1..t</sub>) = &int; f<sub>t</sub>(q) G<sub>t</sub>(q) &Phi;(q)<sup>n&minus;t</sup> dq, the expected reward of stopping now, and w<sub>t</sub> = P(the true best is still to come | x<sub>1..t</sub>).

**Policy.** The exact optimum depends on the whole function G<sub>t</sub>, so it is approximated by Longstaff&ndash;Schwartz regression Monte Carlo: backward in t, regress the realised payoff of continuing on eight polynomial features of (p<sub>t</sub>, w<sub>t</sub>) and stop when p<sub>t</sub> is at least the fitted continuation value. Scored on fresh trials it is a feasible policy, so its success rate is an unbiased estimate of a lower bound on the optimum. **Upper bound:** an information relaxation, the clairvoyant who sees all n noisy scores and takes the largest (the largest posterior mean). The optimum lies between the two.

**Checks.** (1) With &sigma; = 0 the exact optimal rule is Gilbert and Mosteller's (1966) threshold rule, stop at a record when &Phi;(x<sub>t</sub>) &ge; b<sub>n&minus;t</sub> (b<sub>1</sub> = 0.5, b<sub>2</sub> = 0.6899, &hellip;; tested); on the same test trials it scores 0.5893 and the fitted policy 0.5888. (2) p<sub>t</sub> is calibrated (tests: its mean is 1/n at every t; among confident stops the hit rate matches it), and on the test trials the mean p<sub>t</sub> at the chosen stop matches the realised hit rate to within 0.0012 at every &sigma;. (3) Feature sensitivity: a 3-feature and a 14-feature basis land within 0.0011 of the 8-feature one at every &sigma;, so the regression has saturated on these two summaries (which says nothing about features beyond them).

| noise &sigma; | best cutoff | best margin | Bayes policy (se) | clairvoyant bound | Bayes &minus; margin (se) | share of cutoff&rarr;Bayes gap the margin closes |
|---|---|---|---|---|---|---|
| 0 | 0.3756 | 0.3756 | 0.5888 (0.0020) | 1 | +0.2131 (0.0026) | 0 |
| 0.5 | 0.2334 | 0.2444 | 0.3818 (0.0020) | 0.5086 | +0.1374 (0.0021) | 7.4% |
| 1 | 0.1429 | 0.1491 | 0.2195 (0.0017) | 0.2740 | +0.0704 (0.0017) | 8.0% |
| 2 | 0.0742 | 0.0760 | 0.1028 (0.0012) | 0.1216 | +0.0268 (0.0012) | 6.1% |

`experiments/results_bayes.txt`, `experiments/results_bayes.json`, `experiments/bayes_vs_rules.svg`.

**Misspecification** (true noise &sigma; = 1 unless stated; the Bayes policy is fitted and run under an assumed model, the rules are the ones tuned for &sigma; = 1, same 60,000 test trials):

| world | Bayes, wrong model | Bayes, right model | cutoff | margin |
|---|---|---|---|---|
| policy assumes &sigma; = 0.5 (half the true noise) | 0.1911 | 0.2195 | 0.1429 | 0.1491 |
| policy assumes &sigma; = 2 (twice the true noise) | 0.1113 | 0.2195 | 0.1429 | 0.1491 |
| true quality mean is +0.5, policy assumes 0 | 0.1988 | 0.2195 | 0.1429 | 0.1491 |
| true quality sd is 2, policy assumes 1 | 0.2137 | 0.3818 | 0.2334 | 0.2434 |

Under-stating the noise or mis-stating the mean still beats the rank-only rules; over-stating the noise, or under-stating how spread out quality is, falls below them. In the last row the world is effectively less noisy (&sigma;/sd = 0.5), which every rule benefits from, but the misspecified policy gains least. So the practical rule is: use the model when the score distribution and noise are calibrated (say, from past rounds), and otherwise prefer the rank rule or err towards assuming *less* noise.

## Limitations
- **One setting.** n = 50, Gaussian quality and noise, one train/test seed pair, a coarse grid. The gains are 1 to 2 percentage points of absolute probability; that is 5% relative at noise 0.5 and 4% at noise 1.
- **Tuning noise.** Parameters come from 8,000 training trials over 138 grid cells, so the chosen (r, d) are noisy and the training gap (+0.014 and +0.007) is optimistic; only the fresh-trial column is the estimate. The cutoff comparator is tuned the same way, so the comparison is fair, but neither is a global optimum.
- **The Bayes policy is approximate.** It sees the history only through (p<sub>t</sub>, w<sub>t</sub>); the true optimum lies between its score and the clairvoyant bound (gaps of 0.03 to 0.13). With no noise it matches the exact optimum to 0.0005. A dual (Andersen&ndash;Broadie) upper bound would narrow the bracket and is not computed.
- **The Bayes comparison is not like for like on information.** The rules use ranks only; the policy also uses the model. That is the finding, not a flaw, but the misspecification table shows what the extra information costs when it is wrong. Only one train/test seed pair and n = 50.
- **&sigma; is assumed known** (the margin is scaled by it).
- **No claim about real hiring or real twins.** This is an analogy-level toy.

## Next steps
Done for the Bayes policy (above). Next: a dual upper bound to bracket the optimum tightly; a policy that learns &sigma; and the quality distribution from the stream (an empirical-Bayes rule), which is the version that would survive the misspecification table; other n.

## Owner steps
None.

## Outside dependencies
Python standard library for the margin step; numpy for the Bayes step (`requirements.txt`).
