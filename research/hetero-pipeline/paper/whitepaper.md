# Cutting a model across heterogeneous devices: exact bottleneck partition, device order, and the price of heterogeneity

**Abstract.** Pipeline-parallel training over a decentralised pool assigns contiguous layer blocks to devices of very different speed and memory. We treat the resulting chains-on-chains bottleneck problem with heterogeneous machines. For a fixed device order, greedy filling is an exact feasibility test (checked against an independent dynamic program, with and without memory caps). Every order satisfies `W/V ≤ T* < W/V + m·w_max/V`. A speed-blind equal split has bottleneck exactly `v̄/v_min` times the lower bound (2.40× at log-speed σ=0.5, 8.25× at σ=1), whereas speed-aware cutting stays within 1.4% at 240 layers. The remaining decision is the device order: at 14 layers and 6 devices the worst order is 1.34× the best on average, no simple sort (fast-first, slow-first, valley) is better than the arbitrary given order (all about 1.16× optimal), and pairwise-swap descent gets within 1.1% of exact. The order penalty shrinks with granularity (1.29× at L=14 to 1.03× at L=224). Memory caps inversely related to speed inflate the bottleneck 1.7×.

## 1. Model
Layers `i=1..L` cost `w_i` (memory `m_i`); devices `j=1..m` have speed `v_j` (memory cap `M_j`). Layers are cut into contiguous blocks, one per device in pipeline order (empty blocks allowed). Stage time is block cost over speed; steady-state throughput is `1/T` with `T` the largest stage time. `W=Σw`, `V=Σv`. Communication and pipeline bubbles are ignored; this isolates the compute-balance question.

## 2. Exact solution for a fixed order
For a given `T`, device `j` can take at most the longest prefix of the remaining layers with cost `≤ T v_j` and memory `≤ M_j`; both constraints are monotone in the block, so taking as much as possible never hurts later devices. Hence greedy fill is an exact feasibility test and `T*` is found by bisection (`feasible`, `bottleneck`). Tests compare `T*` with an independent O(m·L²) dynamic program on 60 random instances without and 60 with memory caps (agreement to 1e-8, and agreement on infeasibility).

## 3. Bounds and the price of heterogeneity
`T* ≥ max(W/V, w_max/v_max)`. Upper bound for any order without memory caps: if `T` is infeasible, each device is filled to within `w_max` of its budget `Tv_j`, so `W > TV − m w_max`, i.e. `T* < W/V + m w_max/V` (tested on all 24 orders of 40 random instances). Since the bound is additive in a granularity term, aware cutting is near `W/V` when `L ≫ m`.

A speed-blind split into equal layer counts loads the slowest device with `W/m`, so its bottleneck is `(W/m)/v_min`, exactly `v̄/v_min` times `W/V` in the continuous limit (the test uses 6000 unit layers). E1 (L=240, m=8, 200 draws, log-normal speeds):

| σ (log speed) | aware / (W/V) | equal split / (W/V) | predicted `v̄/v_min` |
|---|---|---|---|
| 0.25 | 1.015 | 1.450 | 1.450 |
| 0.50 | 1.014 | 2.402 | 2.402 |
| 0.75 | 1.015 | 4.596 | 4.596 |
| 1.00 | 1.014 | 8.251 | 8.251 |

E2 (aware cutting, m=8, σ_v=σ_w=0.5): mean ratio to `W/V` is 1.67 at L=8, 1.29 at 16, 1.15 at 32, 1.07 at 64, 1.04 at 128, 1.009 at 512, always below the worst-case bound (2.87 down to 1.06). Coarse layers, not heterogeneity, are the cost of a good partition.

## 4. The device order
Once cutting is exact the pipeline order is the decision left. E3 (L=14, m=6, σ_v=0.8, σ_w=0.6, 100 draws, all 720 orders): ratio to the best order, mean/worst — given (arbitrary) 1.160/1.357, fast-first 1.160/1.449, slow-first 1.161/1.476, valley (fast at both ends) 1.212/1.602; the optimum was hit by the sorts in at most 1 of 100 draws. Pairwise-swap descent from 3 random starts: 1.011/1.094, optimal in 66/100. Worst order versus best: 1.343 mean, 1.610 max. So sorting by speed is not a heuristic to rely on; local search is cheap because each evaluation is a linear-time greedy. E5 (random orders, m=6): worst/best sampled order is 1.29 (L=14), 1.20 (28), 1.10 (56), 1.05 (112), 1.03 (224): the order matters for coarse partitions and fades roughly like the granularity term.

## 5. Memory caps
E4 (L=64 unit-memory layers, m=8, σ_v=0.5, caps `κ(L/m)(v_j/v̄)^γ`, best of four orders; means over instances that were feasible): caps independent of speed (γ=0) with κ=1.05 inflate the bottleneck 2.24× (max 7.1×) and with κ=1.3 1.23×; caps proportional to speed (γ=1) inflate 1.000× when feasible, but at κ=1.05 integer rounding makes all four orders infeasible in 119/200 draws; caps inversely related to speed (fast devices small, γ=−1, κ=1.3) inflate 1.68× (max 2.84×). Memory is free only when it scales with speed.

## 6. Implications
(i) Never split by layer count over heterogeneous devices; the loss is `v̄/v_min` and grows without bound in σ. (ii) Use exact greedy cutting, then search the order with swaps; do not trust speed sorts. (iii) Prefer more, thinner layers or finer-grained blocks: the residual gap is `~m w_max/V`. (iv) Provision memory proportional to compute; where it is not, treat memory rather than speed as the binding resource. (v) A verifier can check a claimed partition in O(L) by recomputing stage times, which suits protocols that publish assignments (`reproducible-refereed-training`, `pipeline-replication`).

## 7. Limits
Static speeds, no communication or latency between stages, no bubbles or micro-batching, unit-consistent layer costs, one block per device, one replica. Random-instance statistics are single-seed (seeds in `experiments/run.py`); the order result is empirical, not a theorem, and the complexity of optimal ordering is not settled here. Related: chains-on-chains partitioning (Bokhari 1988; Pınar and Aykanat 2004), heterogeneous pipeline scheduling (Benoit and Robert 2008), decentralised pipeline training such as SWARM and SkipPipe.
