# How Wide Should a Dispute Bisect? Arity and Leaf Size of Refereed Verification Games

*Stylised model; MIT licensed. Code: `src/dispute_arity`, results: `experiments/results.txt`.*

## Abstract
Refereed verification of decentralised training (Verde-style refereed delegation; optimistic-rollup dispute games) localises a disputed training trace of T steps to one divergent step by repeated search, then has a referee re-execute the remainder. Binary bisection is the default. We show that when each round has a fixed cost `a` (transaction, latency) and each posted checkpoint costs `b`, the optimal arity is the solution of `k ln k − k + 1 = a/b`, binary is optimal only if `a/b ≤ 2 ln 2 − 1 ≈ 0.386`, and for realistic ratios wide arities are several times cheaper. We add three results: an exact dynamic program for adaptive per-round arities (gain over the best uniform arity ≤ ~1% in our sweep, a negative result that justifies the simple rule), a leaf-size trade-off with referee re-execution cost `c` per step, and a latency reading in which a time penalty is just extra `a`. An executable protocol on a real SHA-256 hash chain confirms the round and checkpoint counts.

## 1. Model
The prover commits states s_0..s_T with s_{t+1}=H(s_t,t). A cheater corrupting step j has s'_t ≠ s_t for all t>j, so the endpoints disagree and the first disagreement is at j. In each round the prover posts k−1 interior checkpoints and the challenger names the first segment whose endpoint it disputes. Round cost is `a + b(k−1)`. When the segment has ≤ m steps the referee re-executes it at cost `c` per step. Total cost is `R(T,k,m)(a+b(k−1)) + c·m` with `R = ⌈log_k(T/m)⌉` rounds under uniform k.

## 2. Optimal arity
Ignoring integrality, cost to reach a single step is `ln T · f(k)` with `f(k) = (a + b(k−1))/ln k`. Setting `f'(k)=0` gives `b k ln k = a + b(k−1)`, i.e.
`k ln k − k + 1 = a/b`.
The left side is increasing from 0 at k=1 and equals `2ln2−1` at k=2, so k=2 is the constrained optimum iff `a/b ≤ 2 ln 2 − 1`. Values: a/b=1 → 2.72 (=e), 10 → 8.17, 100 → 37.7, 1000 → 226.

At T=10⁶ (b=1), integer search: a=0.25 → binary (25.0); a=5 → k=4 at 80 vs 120 for binary (1.5×); a=10 → k=10 at 114 vs 220 (1.9×); a=100 → k=32, 3.9×; a=1000 → k=100, 6.1×. The integer optimum sits below k* at large a because rounds are integer: k=100 gives exactly 3 rounds for 10⁶.

## 3. Adaptive schedules
`C(n) = min_k a + b(k−1) + C(⌈n/k⌉)` is solved exactly. Over T∈{10³..10⁶} and a∈{0.25..1000} adaptive beats the best uniform arity by at most 1.1% (T=50 000, a=10), and often 0. Widening early and narrowing late, e.g. [5,7,7,8,8,8,8] at a=10, only trims integer slack. **Practical rule: pick one arity near k*, tuned to make ⌈log_k T⌉ tight.**

## 4. Leaf size
Stopping early trades rounds for re-execution: minimise over m of `C(T→m) + c·m`. At T=10⁶, a=10, b=1 (search over a grid of m): c=0.001 → m=4096, 56% cheaper than full bisection; c=0.01 → 1024, 41%; c=0.1 → 64, 24%; c=1 → 6, 8.7%; c≥10 → full bisection. For ML training the per-step cost c is high relative to on-chain fixed costs, so full bisection to a single op/step is right; for cheap deterministic segments a coarse leaf helps.

## 5. Latency
If each round also takes challenge period L and time is worth λ per unit, the fixed cost becomes `a + λL`. At b=1, base gas 5: λL=0 → 9 rounds, cost 78; λL=20 → 5 rounds, arities ≈[12,17,17,17,17]; λL=500 → 3 rounds of arity 100. Latency-sensitive systems should therefore use wide arity; the paper's Section 2 formula applies with the shifted `a`.

## 6. Executable check
`dispute()` runs the protocol on a SHA-256 chain with T=1000, k=10 and every one of the 1000 corruption positions localised to the exact step, worst case 3 rounds and 27 checkpoints, matching `⌈log_10 1000⌉` and 3·9.

## Limitations and relevance
Costs are stylised linear; real chains have calldata/storage non-linearities, and prover memory to store checkpoints is ignored. Floating-point non-determinism (see `reproducible-refereed-training`) means the "first divergent step" is a tolerance question, not addressed here. A single dishonest challenger stalling to the timeout is bounded by `R·L` rounds; bonding it is left open. The result is a design rule for verifiability layers of decentralised ML protocols (Gensyn's Verde line of work): choose arity from `a/b`, then check integer round counts.

## Reproduce
`PYTHONPATH=src python3 -m unittest discover -s tests` (10 tests) and `PYTHONPATH=src python3 experiments/run.py`.
