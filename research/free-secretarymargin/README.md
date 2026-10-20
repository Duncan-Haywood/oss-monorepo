# free-secretarymargin: with noisy scores, does a "beat the record by a margin" rule pick the best candidate more often than the best cutoff?

**Why this was worth doing.** `free-secretarynoise` ended on a question: its best cutoff rule is only one family, so how much is left on the table? A first cheap step is a two-parameter rule that asks for a *margin*: after skipping r&minus;1 candidates, take the first whose noisy score beats the earlier maximum by at least d. When scores are noisy a barely-better record is weak evidence that it is the true best, so a margin should help. **Result (simulation, n = 50, parameters tuned on 8,000 training trials, scored on 60,000 fresh paired trials):** a small, real gain at moderate noise and none at high noise. P(pick the true best) rises from 0.2334 to 0.2444 at noise 0.5 (+0.0111, standard error 0.0014) and from 0.1429 to 0.1491 at noise 1 (+0.0062, se 0.0015); at noise 2 the gain is +0.0018 (se 0.0011), not distinguishable from zero; with no noise the tuning picks d = 0, the plain cutoff. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/free-secretarymargin/

**Builds on.** `research/free-secretarynoise` (same model and noise definition) and the classical cutoff rule (Lindley 1961; Ferguson 1989, *Statistical Science* 4(3); cited from memory, not re-verified: no bibliographic service was reachable from this session). No CU Boulder group's work is built on or implied; the link to the digital-twin theme is the analogy of a noisy screening score.

## Model and rule
True quality q<sub>i</sub> ~ N(0,1) iid; observed x<sub>i</sub> = q<sub>i</sub> + &sigma;&epsilon;<sub>i</sub>. Margin rule (r, d): skip candidates 1 to r&minus;1, then take the first later candidate with x<sub>i</sub> greater than the earlier observed maximum plus d&middot;&radic;(1+&sigma;<sup>2</sup>) (d in units of the observed-score sd); if none qualifies, take the last. d = 0 is the cutoff rule. Success means the pick has the largest true quality.

Method: for each noise level, grid-search r in 8..30 and d in {0, 0.1, 0.2, 0.4, 0.7, 1.0} (the cutoff rule is the d = 0 row) on training trials (seed 11), then score the winning margin rule and the winning cutoff rule on fresh trials (seed 12) and report the paired difference with its standard error.

## Reproduce
```bash
cd research/free-secretarymargin
python3 -m unittest discover -s tests -v     # 5 tests
python3 experiments/run.py                   # about 25 s, stdlib only
python3 experiments/figure.py                # stdlib only
```

## Results
`experiments/results.txt`, `experiments/results.json`, `experiments/margin_vs_cutoff.svg`.

| noise &sigma; | best cutoff r | best margin (r, d) | test P(best), cutoff | test P(best), margin | gain (se) |
|---|---|---|---|---|---|
| 0 | 20 | (20, 0) | 0.3756 | 0.3756 | 0 (same rule) |
| 0.5 | 15 | (14, 0.2) | 0.2334 | 0.2444 | +0.0111 (0.0014) |
| 1 | 15 | (10, 0.4) | 0.1429 | 0.1491 | +0.0062 (0.0015) |
| 2 | 11 | (9, 0.4) | 0.0742 | 0.0760 | +0.0018 (0.0011) |

Check: the noiseless simulation agrees with the exact formula in the tests (n = 20, r = 8: 0.384). The tuned cutoffs here (15 at noise 0.5 and 1, from 8,000 training trials) are noisier than `free-secretarynoise`'s 40,000-trial 16 to 17.

## Limitations
- **One setting.** n = 50, Gaussian quality and noise, one train/test seed pair, a coarse grid. The gains are 1 to 2 percentage points of absolute probability; that is 5% relative at noise 0.5 and 4% at noise 1.
- **Tuning noise.** Parameters come from 8,000 training trials over 138 grid cells, so the chosen (r, d) are noisy and the training gap (+0.014 and +0.007) is optimistic; only the fresh-trial column is the estimate. The cutoff comparator is tuned the same way, so the comparison is fair, but neither is a global optimum.
- **Still not the optimal policy.** A margin rule uses only the running maximum. The Bayes-optimal rule, which uses the whole history of scores, is not computed here, so the gain over cutoffs is a lower bound on what a &sigma;-aware rule could reach.
- **&sigma; is assumed known** (the margin is scaled by it).
- **No claim about real hiring or real twins.** This is an analogy-level toy.

## Next steps
Compute (or approximate by Monte Carlo value iteration) the Bayes-optimal stopping policy for small n to see how much of the gap to the optimum the margin rule closes; try a margin that shrinks as candidates run out.

## Owner steps
None.

## Outside dependencies
Python standard library only.
