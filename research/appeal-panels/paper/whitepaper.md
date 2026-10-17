# Escalating appeal panels: when fees make dispute error a product over tiers

## Question
Optimistic and refereed verification protocols settle contested results with jurors, and appeals to larger panels are the standard fix for juror error (Kleros-style courts, optimistic rollup challenge games). How much accuracy does an appeal ladder buy per juror seat, and what must the appeal fee be for it to work?

## Model
Tier k has n_k odd jurors, each independently correct with probability a > 1/2, so the tier is correct with probability M_k = P(Bin(n_k, a) > n_k/2). The loser of tier k may appeal to tier k+1 by paying an up-front fee f = j·n_{k+1}; the winner of the last tier held collects a prize V. A side appeals iff its chance of winning the next tier times V exceeds the fee (myopic). The truth side wins tier k+1 with q = M_{k+1}, the wrong side with 1 − q.

## Results
1. **Three fee regimes (exact).** f < V(1−q): both sides appeal and the last tier alone decides, accuracy M_K, all seats burnt. V(1−q) ≤ f < V·q: only the truth side appeals, and the final error is exactly ∏_k (1 − M_k) over the tiers reached. f ≥ V·q: nobody appeals and tier 1 decides. In the middle regime error is a product, so it falls double-exponentially in the number of tiers.
2. **The window opens at a computable size.** 1 − q_n falls exponentially in n (Chernoff rate KL(½‖a)) and the fee is linear, so V(1−q_n) ≤ j·n holds from a smallest odd size onward: 11 jurors at V=100, 23 at V=1000, 41 at V=10⁴ (a=0.7, j=1). A ladder that steps to 9 jurors at V=100 leaves the wrong side appealing 0.78 times per dispute and has 6× the error and 2.5× the seats of the 11-juror ladder.
3. **Appeals are almost free when they work.** The ladder 3 → 11 → 27 has error 2.4·10⁻⁴ at 5.83 expected juror seats (worst case 41), because tier 2 is reached only after a 21.6% tier-1 error. A single panel costing at least as much (7 seats) errs 12.6%, 523× worse; a fourth tier (81) gives 2·10⁻⁸ at 5.85 seats. Fees that are too low (j=0.05) run all three tiers every time (41 seats) and only reach the last tier's error 1.4·10⁻²; fees too high (j=9) never appeal and leave error at 21.6%.
4. **Shared bias sets a floor no ladder removes.** If with probability ρ the whole jury pool is one common draw (same source, same misleading evidence), accuracy is at most ρa + (1−ρ)(1 − ∏(1−M_k)), so error ≥ ρ(1−a) however many tiers: 1.5%, 3%, 9% for ρ = 0.05, 0.10, 0.30 at a = 0.7, and the mean seats used grow from 5.9 to 25 because the truth side keeps appealing a verdict that cannot flip.

All numbers are exact enumerations from `model.py`, checked against 200,000-trial Monte Carlo (error and seats agree to Monte Carlo noise; see `experiments/results.txt`).

## Limitations
Jurors are independent given the truth with a common accuracy a, and there is no incentive for jurors themselves (see `effort-elicitation`, `peer-prediction-effort`, `focal-laziness`); appeals are myopic, non-refundable and priced against the marginal correctness probability; the truth side is assumed able to front fees (a liquidity constraint would shift the window); tier errors are independent across tiers except through the ρ mixture; bribery of jurors is out of scope (see `verifier-bribery`, `challenge-window`). The fee rule f = j·n is one convenient schedule, not derived as optimal.

## Reproduce
`PYTHONPATH=src python3 -m unittest discover -s tests -v`; `PYTHONPATH=src python3 experiments/run.py`.
