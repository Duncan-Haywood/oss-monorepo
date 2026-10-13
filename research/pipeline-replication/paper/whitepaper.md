# Replicate or skip? Stage redundancy for pipeline-parallel training on unreliable workers

*Duncan Haywood. MIT licence. Code and experiments: `../src`, `../tests`, `../experiments`.*

## Abstract
Decentralised pipeline-parallel training sends each microbatch through `L` stages held by volunteer workers that come and go. Two defences compete: replicate each stage `r` times, or let a microbatch skip up to `s` dead stages (as in SkipPipe-style routing) at a quality cost `κ` per skip. We give an exact model. (i) The drop probability is a binomial tail, `P(Bin(L, q) > s)` with per-stage outage `q = ρ + (1−ρ)(1−a)^r`. (ii) Without skipping, replicas cannot lift success above the shared-domain floor `(1−ρ)^L`: at `L=48`, `ρ=0.001` no `r` reaches a 1% drop rate, while allowing one skip makes `r=3` enough. (iii) Each extra allowed skip cuts the replicas needed for a `10⁻³` drop rate at `L=48, a=0.9` from 5 (no skips) to 2 (four skips), halving worker cost (240 → 96). (iv) Under a multiplicative skip penalty the cost-optimal design is `r=1` with heavy skipping when `κ` is small and moves toward replication as `κ` grows; the gain over the best no-skip design ranges from 2.9× to 1.08×. Exact formulas, checked against Monte Carlo; stylised model.

## 1. Model
A microbatch needs a live worker at each of `L` stages. Stage `j` has `r` replicas, each live w.p. `a`, independently, except that with probability `ρ` the stage's failure domain (rack, region, provider) is out and all replicas fail together. So a stage is dead w.p. `q = ρ + (1−ρ)(1−a)^r`, independently across stages. The number of dead stages is `D ~ Bin(L, q)`. A microbatch is routable iff `D ≤ s`; a skipped stage multiplies the microbatch's usefulness by `1−κ`. Cost is `L·r` workers; *cost per yield* is `L r / E[(1−κ)^D ; D ≤ s]`.

## 2. Drop probability and replicas
The drop probability is `P(D > s)`, exact. For `ρ=0` and small `q` the Poisson tail gives `q* ≈ (ε (s+1)!)^{1/(s+1)}/L`, hence `r ≈ ln(1/q*)/ln(1/(1−a))`. Table (E1, `L=48, a=0.9`, target drop `10⁻³`):

| skip budget s | 0 | 1 | 2 | 4 | 8 |
|---|---|---|---|---|---|
| exact r | 5 | 4 | 3 | 2 | 2 |
| approximation | 4.68 | 3.03 | 2.42 | 1.87 | 1.40 |

The approximation is within about one replica but is biased low for `s ≥ 1` (it ignores the `(1−q)` factors and uses only the leading tail term), so it is a sizing guide, not a certificate; the exact tail is cheap and should be used. Replicas fall only logarithmically in `1/ε` and in `L`, but a small skip budget removes several of them because the requirement moves from "no dead stage" to "at most `s`".

## 3. The domain floor
With correlated outages, `P(success) ≤ (1−ρ)^L` at `s=0` for every `r` (as `r→∞`, `q→ρ`). E2 (`L=48, a=0.9`, target drop `10⁻²`): `ρ=10⁻⁴` needs `r=4`; at `ρ=10⁻³` (floor success 0.953) `s=0` is infeasible at any `r`, `s=1` needs `r=3`; at `ρ=0.005` one skip is not enough but `s=2` needs `r=3`; at `ρ=0.01` (floor 0.617) `s=3` is needed. So replicas within one domain are useless against correlated failure; what helps is spreading replicas over independent domains (which sets `ρ→0` at the price of cross-domain bandwidth) or a skip budget. The condition for feasibility at `r=∞` is exactly `P(Bin(L,ρ) ≤ s) ≥ 1−ε`.

## 4. Cost-optimal design
With `κ` the per-skip quality loss, E3 minimises `L r/yield` over `r ≤ 60`, `s ≤ 24`:

| L | κ=0.02 | κ=0.10 | κ=0.40 |
|---|---|---|---|
| 16 | r=1, ratio 2.3 | r=1, 2.0 | r=1, 1.2 |
| 48 | r=1, 2.9 | r=1, 1.9 | r=2 (s=12), 1.3 |
| 128 | r=1, 2.6 | r=2 (s=18), 1.5 | r=3 (s=9), 1.08 |

(ratio = cost of the best no-skip design ÷ cost of the best design.) Two caveats. Several small-`κ` optima sit at the `s=24` search cap, meaning "skip whatever is dead" is best under this yield model; that is an artefact of a linear-in-skips penalty and real skip penalties compound with depth and data-dependent layer importance. And at `κ=0.4` replication reappears because each skip is expensive. Measuring `κ` for a real model is the missing empirical input.

## 5. Checks
Monte Carlo (E4, 40,000 trials, `L=20, r=2, a=0.8, ρ=0.01`): success 0.3602/0.7397/0.9264/0.9972 vs exact 0.3615/0.7389/0.9259/0.9975 for `s=0,1,2,4`. 11 unit tests (binomial identities, monotonicity in `s`, minimality of `r`, floor, simulation).

## 6. Limits and implications
Independent stage outages, static availability, instantaneous routing, and a fixed multiplicative skip penalty; no queueing, no mid-flight failures (a microbatch lost in transit adds a retry factor `e^{λLτ}` we do not model), no adversarial workers (see `replicated-execution` for that). For a verifiable-training protocol the practical rule is: first buy independence across failure domains, then buy a skip budget, and only then add same-domain replicas; and any tolerance on skipped-stage usage must be part of the committed trace so a referee can replay it.
