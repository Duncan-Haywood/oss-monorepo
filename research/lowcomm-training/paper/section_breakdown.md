# Draft section: the median's breakdown point in DiLoCo-style training

*Draft for the programme paper (milestone 7). AI-assisted; no affiliation implied. Every number below is in `LOG.md` (milestones 5i to 5n) and regenerates with `python3 paper/breakdown_table.py`. The arXiv ids cited here and in the proposal were machine-checked on 2026-10-29 (`cite_check.py`: id resolves to the title given); what each paper says is taken from its title and abstract-level claim, not re-derived here.*

## Question

Coordinate-wise median aggregation of worker deltas is the standard cheap defence when some of the M workers in a low-communication run are untrusted. How many of M = 16 workers can send adversarial deltas before the final loss is ruined, and does the answer depend on how the attackers coordinate?

## Setup

Simulated DiLoCo on a 413k-parameter GPT on tinyshakespeare: M = 16 workers, H = 16 inner steps, 3,840 inner steps, plain outer step, batch 16 per worker, inner lr 2e-3 (milestone 3d tuning). Clean references are the same-seed M = 16 median runs of 5i (final validation loss 1.5356 mean over seeds 0 to 2; the mean aggregator gives 1.5376). Excess is final validation loss minus the clean median's on the same seed. Two attacks: (a) *independent flips*, k workers each send -10x their own delta; (b) *coordinated*, k workers send 1e3 x the negated sign of the honest workers' mean delta per coordinate, the strongest push a rank-bounded statistic allows.

## Result

| k of 16 | independent -10x flip (excess nats, seeds) | coordinated same-vector (excess nats, seeds) |
|---|---|---|
| 2 | +0.014 (2) | not run |
| 3 | not run | +0.093 (1) |
| 4 | +0.047 (2) | +0.231 (2) |
| 5 | +0.081 (2) | +0.365 (2) |
| 6 | +0.140 (2) | +0.529 (2) |
| 7 | +0.291 (3) | +0.766 (1) |
| 8 | diverged (2) | diverged (2) |
| 9 | not run | diverged (2) |

1. **One attacker is free at M = 16.** The paired flip cost falls from +0.095 (M = 4) to +0.021 (M = 8) to +0.002 to +0.004 (M = 16), at the seed-noise floor (about 0.005 to 0.01). An order-statistic account (5f, 5g) predicted about +0.005, which the observation is at or below; it confirms "at the noise floor", not the 4x factor.
2. **Degradation below the wall is smooth, convex, and attack-dependent.** Coordination multiplies the cost 2.5x to 5x at equal k (k = 4: +0.231 against +0.047). A squared-shift scaling from the single-attacker cost under-predicts the independent curve by 1.8x (k = 2) to 3.8x (k = 6), so shift is the wrong summary; the bias relative to the honest signal mu is the quantity that matters.
3. **The breakdown is at k = M/2 = 8 under both attacks.** Both seeds diverge at k = 8 (non-finite weights under the coordinated attack, validation loss about 5e5 under independent flips), the first count at which rank 8 of the 16 sorted values can be an attacker's. k = 7 still trains. This is the classical breakdown point of the median reached in practice, on a real transformer, with the attack strength not mattering at the wall.
4. **A net-signal crossover account is half right.** A numpy model (i.i.d. Gaussian, mu/sigma = 0.4 as measured in 5h) puts the point where the median's bias exceeds the honest signal between k = 7 and 8 for independent flips, for every mu/sigma from 0.3 to 1.0, and the runs break there. For the coordinated attack the same model puts the crossing at k = 3 to 4, yet k = 4 to 7 train with a smooth, roughly linear loss increase of +0.12 to +0.23 nats per attacker. So "net signal below zero means divergence" does not carry over; only the rank (median-is-attacker-value) wall predicts divergence in both cases.

## Related work

Coordinate-wise median and trimmed mean as Byzantine-robust aggregators were analysed with statistical rates by Yin et al. (arXiv:1803.01498); Chen et al. (arXiv:1705.05491) set up Byzantine gradient descent earlier. Attacks that stay inside such a rule's tolerance but still hurt training are the subject of Baruch et al., "A little is enough" (arXiv:1902.06156), Xie et al., inner-product manipulation (arXiv:1903.03936) and El Mhamdi et al. (arXiv:1802.07927); our same-vector attack is in that family, but it is a simpler, stronger-than-needed push, not a reproduction of any of them. Karimireddy et al. (arXiv:2012.10333) show history-aware aggregation helps against time-coupled attacks, which is one candidate for a rule that tolerates more than the median does. What we add is narrow: the breakdown point and the smooth degradation below it, measured on a transformer trained with a DiLoCo-style outer loop (arXiv:2311.08105), where the aggregate is applied to pseudo-gradients every H = 16 steps, with k and attack type varied at fixed M = 16.

## Limits

Two seeds per cell (three at k = 7 independent, one at k = 3 and k = 7 coordinated), so no interval is reported; the divergent cells have no spread to report. One model, one character-level corpus, 413k parameters. The attackers know the honest mean sign exactly. Late-training deltas are near-Gaussian with mu/sigma about 0.4 (5h) while the first rounds are heavy-tailed, so conclusions about the median do not transfer to a heavy-tailed regime without a check. The trimmed mean was compared only at one attacker (+0.009 against the median's +0.004 paired, se 0.007 and 0.004: no measured difference).

## What this does not claim

It does not show the median is a good defence: past about a third of the workers the loss rises by 0.3 to 0.8 nats, and at half it fails outright. It places the wall; a rule that tolerates k >= M/2 needs a different aggregator (reputation, a trusted subset, or the verification mechanisms of the sibling programme `verifiable-training-mechanisms`).

## Reproduce

`python3 paper/breakdown_table.py` regenerates the table from `experiments/*/*.jsonl`. The training runs are `experiments/gpt_median_coalition/{coalition,coordinated}.py` and `experiments/gpt_median_k7/k7.py`, about 43 minutes per run on CPU.
