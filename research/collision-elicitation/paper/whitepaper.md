# Eliciting the replica-agreement probability of a nondeterministic operation: a two-run proper score, U-statistic sample sizes, and why one run is not enough

## Question
Verification by replicated execution (and bitwise-equality checks such as those in Gensyn's Verde and RepOps line) assumes honest replicas agree. In practice an operation's output varies with reduction order, kernel and hardware. Its output distribution p over K distinct results has *collision probability* Γ(p) = Σpᵢ², the chance two honest runs agree (Σpᵢᵏ for k runs). Can a protocol pay a worker to report Γ truthfully, without ground truth, and how many runs does it need? This follows the multi-observation elicitation line of Casalaina-Martin, Frongillo, Morgan and Waggoner: some properties are elicitable only from several samples of the same distribution.

## Model
An operation returns one of K outputs with probability p. A worker reports r ∈ [0,1]. The protocol draws k independent runs and pays S(r; y₁..y_k) = −(r − 1[y₁ = … = y_k])². Fleets are mixtures of hardware classes, each deterministic within a class, so p is the vector of class shares.

## Results
1. **Two runs make Γ elicitable, with exact regret.** E[S] = −(r − Γ_k)² − Γ_k(1−Γ_k) for Γ_k = Σpᵢᵏ, so truthful reporting is the unique optimum and misreporting by δ costs exactly δ² (checked against full enumeration of all Kᵏ run tuples, k = 2, 3, to 1e-12).
2. **One run cannot do it (level-set witness).** A property elicitable from one observation has convex level sets. p = (.8,.2,0) and q = (.2,.8,0) both have Γ = 0.680, but their midpoint has Γ = 0.500, so no single-run score elicits Γ. Two runs are the minimum.
3. **Use all pairs, not disjoint pairs.** With n runs the all-pairs U-statistic is unbiased with exact variance [4(n−2)ζ₁ + 2ζ₂]/(n(n−1)), ζ₁ = Σp³ − Γ², ζ₂ = Γ(1−Γ) (matches full enumeration and 20,000-run Monte Carlo to within 1%; e.g. 0.00133 vs 0.00135 at n = 100). Disjoint pairs have variance ζ₂/⌊n/2⌋. The ratio tends to 2ζ₁/ζ₂: 0.27 at n = 100 for p = (.6,.3,.1), so the same accuracy needs about a quarter of the runs.
4. **Fleet diversity is priced by Simpson's index.** With H equal hardware classes Γ = 1/H, so a strict-equality check over k honest replicas false-slashes with probability 1 − H^{1−k}: 50% at H = 2, k = 2; 98.8% at H = 3, k = 5. Bitwise checking is safe only when the fleet is one class (RepOps) or the check uses a tolerance.
5. **Collusion has a blind spot.** If a fraction ε of runs are colluders returning one common wrong value, agreement becomes (1−ε)²Γ + ε². It equals Γ exactly at ε = 2Γ/(1+Γ), so a Γ-only statistic is blind to that contamination level; below it, contamination lowers agreement when Γ is high and raises it when Γ is low. Γ must be paired with a tolerance-based check, not used alone.
6. **float32 check.** Summing 8, 64 and 512 Gaussian terms in float32 under four kernel orders with shares (.4,.3,.2,.1) gives four distinct results for 8 and 64 terms (Γ = 0.300) and three for 512 (Γ = 0.420, two orders coincide). The U-statistic from 40 runs recovers Γ within 0.001 on average with sd ≈ 0.035–0.040; ±0.05 at 95% needs 70–91 runs.

## Limitations
Stylised: runs are i.i.d. draws from a fixed p, workers are risk-neutral, and the reported Γ is not tied to a payment for the computation itself. The float32 fleets are simulated summation orders, not measured GPUs. Hardware classes are assumed known only through their shares. Independence between the two runs is required and is not enforced here (a worker who picks both runs breaks it, and a common seed turns Γ into 1).

## Reproduce
`PYTHONPATH=src python3 -m unittest discover -s tests -v` (8 tests) and `PYTHONPATH=src python3 experiments/run.py`.
