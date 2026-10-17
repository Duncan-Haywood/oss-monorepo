# Local SGD when workers drop in and out: exact noise floor, stability limit and participation bias

*Stylised: one quadratic mode at a time, independent Gaussian gradient noise, workers join each round independently with probability `p`, identical workers unless stated. Pure Python; every formula is checked against a literal simulation (`tests/`, `experiments/results.txt`).*

## Question
`noisy-local-sgd` gave the stationary noise floor of DiLoCo-style local SGD with `M` workers present in every round. In a permissionless network the cohort is random: each of `N` workers shows up with probability `p`, so `K ~ Binomial(N,p)` workers report. How should the aggregator combine the ones that do, and what does thin participation cost in noise floor, in speed, in the largest stable outer step, and in whose objective gets optimised?

## Model
A participant runs `H` inner steps of size `η` with gradient noise `σ²` and returns `q^H x + n`, `q = 1−ηa`, `Var n = V_w = η²σ²(1−q^{2H})/(1−q²)`; the outer curvature is `s = 1−q^H`. Two aggregation rules:

- **Rule A (average the participants; skip an empty round):** `x' = x − α(x − mean of returns)`.
- **Rule B (fixed normaliser):** `x' = x − α · Σ_participants (x − return) / (Np)`, i.e. divide by the expected count.

## Exact results
1. **Rule A: `Var x = α V_w m / (s(2−αs))`, `m = E[1/K | K≥1]`.** Empty rounds slow convergence but leave the stationary variance untouched. Against everyone present it costs `N·m`, which exceeds `1/p` (Jensen: thin rounds are noisy and are weighted like full ones); against a fixed cohort of `Np` it is `Np·m ≈ 1+(1−p)/(Np)` (1.15–1.29 at `Np` = 2–3.2; the expansion fails near `Np = 1`, where conditioning on `K≥1` dominates). Independent of `α`.
2. **Rule B: `Var x = α V_w / (Np·s(2−αs c))`, `c = 1+(1−p)/(Np)`; stable iff `αs c < 2`.** The random count multiplies the contraction, `E(1−αsK/(Np))² = 1−2αs+α²s²c`, so the largest stable step falls from `2/s` to `2/(sc)` (1.07 of `1/s` at `Np=1`) and the fastest per-round contraction is `1−1/c` (0.47 at `Np = 1`, 0.22 for `N=32,p=0.1`).
3. **Rule A can contract almost fully in a round** (`ρ = p₀ + (1−p₀)(1−αs)²`, `p₀ = (1−p)^N`; 0.034 at `N=32,p=0.1` against B's floor of 0.22), **but at matched speed B is quieter at small steps**: the floor ratio A/B tends to `E[K|K≥1]·E[1/K|K≥1] ≥ 1` (1.34 at `N=32,p=0.1`; results §4 gives 1.33, 1.30, 1.26, 1.20 at contraction 0.96, 0.82, 0.65, 0.51). Rule B lets thin rounds move less; A gives every non-empty round the same step. The order reverses at fast rates (A/B = 0.96 at contraction 0.28, which B can barely reach).
4. **Participation bias.** With heterogeneous workers (optima `c_i`, weights `w_i = 1−(1−ηa_i)^H` from `local-sgd-bias`, participation `p_i`), Rule B's mean fixed point is `Σ p_i w_i c_i / Σ p_i w_i`, so reliable workers pull the model toward their own objective: with `c=(0,1,2)`, `w` equal, `p=(0.9,0.5,0.1)` the fixed point is 0.467 instead of 1.000 (simulation 0.465). Scaling worker `i`'s displacement by `1/p_i` (inverse propensity) restores `Σ w_i c_i / Σ w_i` exactly (simulation 0.998). Two workers with `w=(0.9,0.1)`, the second present 10% of the time: 0.011 against 0.100.

Simulation matches every variance to 0.5% (300k rounds; results §1).

## Limitations
Independent Bernoulli participation (real churn is correlated and depends on load and price), known `p` for the IPW fix (an estimated `p_i` adds variance, untested), Gaussian noise, one mode, no momentum, and Rule A's bias under heterogeneity is not derived (its weights depend on `K`). Noise variance enters only through the second moment, so the floors do not need Gaussianity.

## Relevance
For open training networks: divide by the *expected* cohort, not the realised one, unless rounds must contract in very few steps; cap the outer step at `2/(s c)` and expect `Np ≈ 1` to halve the usable step range; and weight each reporter by the inverse of its participation probability or the reliable hardware will silently set the objective. Companion to `noisy-local-sgd`, `local-sgd-bias`, `outer-momentum`, `churn-checkpointing` and `straggler-backup`.
