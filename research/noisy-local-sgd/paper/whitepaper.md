# The noise floor of DiLoCo-style local SGD: exact stationary loss, momentum, and sync interval

*Stylised: quadratic loss, independent Gaussian gradient noise, shared Hessian eigenbasis, identical workers. Pure Python; every formula is checked against a literal simulation (`tests/`, `experiments/results.txt`).*

## Question
`local-sgd-bias` fixed the bias of local averaging and `outer-momentum` tuned the outer optimiser, both noise-free. With stochastic gradients, how much noise survives at stationarity, how do the number of local steps `H`, the outer step `α`, momentum `β` and the worker count `M` trade it against speed, and what does that imply for the sync interval?

## Model and exact results
Mode `i` has curvature `a_i`; each of `M` workers runs `H` inner steps of size `η` with gradient noise variance `σ²`. With `q = 1−ηa` the averaged end point is `q^H x + ξ`, `Var ξ = V = η²σ²(1−q^{2H})/((1−q²)M)`, and the outer optimiser (heavy ball, `v ← βv+g`, `x ← x−αv`) sees curvature `s = 1−q^H`. Then `x` is an AR(2) process and its stationary variance is exact:

**Var x = α V (1+β) / ((1−β) s (2(1+β) − α s))**, stable iff `αs < 2(1+β)`; the stationary loss is `Σ (a_i/2) Var x_i`. It matches simulation to 0.2% (results §1).

1. **At `α=1` the floor does not depend on `H`.** `V/(1−q^{2H}) = η²σ²/((1−q²)M)`: local steps neither add nor remove stationary noise (§2, 2.98211 for every `H`). It is exactly `1/M` of the single-worker floor at any `α`.
2. **For `α<1` more local steps lower the floor, but by less than half.** As `α→0` the floor is `α η²σ²(1+q^H)/(2(1−q²)M)`, so `H` shrinks each mode by `(1+q^H)/(1+q) ∈ (½,1)` (tested exactly; §2: 0.126 → 0.077 from `H=1` to 256 at `α=0.05`, κ=100).
3. **Momentum is free noise-wise at equal effective step.** With `α_e = α/(1−β)`, `Var = α_e V / (s(2 − α_e s (1−β)/(1+β)))`: identical to plain SGD as `α_e s→0`, and lower when the step is large (3.5× lower than plain at `α_e s = 1.4`, `β=0.99`; §3). So momentum's rate gain (see `outer-momentum`) costs no extra floor; the floor is set by `α_e`, not by `β`.
4. **Workers buy linear speedup until the step saturates.** The floor scales as `α/M`, so holding it fixed lets `α ∝ M`; wallclock to a floor `ε=0.01` (κ=200, `C=100`) falls 1×, 2×, 4×, 7.97×, 15.95×, 63.8×, 331× for `M=1…256` (§4), the last still with `α=0.92<1`. Beyond `α s_max ≈ 2` the speedup must stop.

## Sync interval under noise
Fix a floor target `ε`, take the largest `α` with floor `≤ ε`, and count rounds (exact mean-square recursion) to reach loss `≤ 2ε`, each costing `H+C` inner steps. Unlike the noise-free case (`H* ≈ C`), the grid-optimal `H*` **grows as `ε` falls**: e.g. κ=200, `C=10`: `H*=5, 11, 38` for `ε=10⁻¹,10⁻²,10⁻³` (`C=100`: 17, 25, 57). Reason: `α` is pinned by the noise, so progress per round on slow modes is `α s_min ≈ αηa_minH`, and larger `H` is the only way to raise it. Syncing every step is 1.4–41× slower than the optimum; `H=C` stays within 1.0–1.7× of the best on the grid (§5). I have no closed form for `H*`; the numbers are grid results (coarse ×1.5 grid).

## Limitations
Quadratic, isotropic gradient noise, no worker heterogeneity (see `local-sgd-bias` for that), no adaptivity of `α` over time (a decaying schedule would beat a fixed `α`), Gaussian noise (only the variance enters). The wallclock model charges `H+C` per round and ignores compute variation across workers.

## Relevance
Gives practical rules for decentralised training: report the stationary loss as `Σ(a/2)Var`, size the outer step by `α_e`, scale it with worker count, and expect the best sync interval to be several times the communication cost when the run is noise-limited. Companion to `local-sgd-bias` and `outer-momentum`.
