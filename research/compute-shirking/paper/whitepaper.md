# Compute shirking: how many skipped training steps hide inside the loss noise?

*Duncan Haywood. MIT licence. Code and experiments: `../src`, `../tests`, `../experiments`.*

## Abstract
A worker in a decentralised training network is paid for `T` optimiser steps and may quietly run `(1−f)T`. Before any trace audit, the cheapest check is the loss: compare the submitted model's held-out loss to reference runs. I show that the compute a cheater can hide is the loss curve inverted at the noise band: if the log-loss difference has null sd `σ'` and the test is one-sided at level `α`, the largest skipped fraction detected with probability `≤ P` solves `L((1−f*)T) = L(T)·exp(σ'(z_α + z_P))`. For `L(t) = L∞ + A t^{−β}` with reducible share `r = A T^{−β}/L(T)` this is closed form, `f* = 1 − (1 + (e^{σ'(z_α+z_P)} − 1)/r)^{−1/β}`, which reduces to `1 − exp(−σ'(z_α+z_P)/β)` at `r = 1` and to `≈ zσ'/(βr)` for small noise. Consequences: (i) hiding grows as the reducible share `r` falls (late in training, or near a loss floor), reaching 64% at `σ' = 0.02, r = 0.05`; (ii) run-to-run seed noise is a floor no evaluation set can beat: with `ρ_seed = 0.02` the 5%-hide target is unreachable at any `m` for `r ≥ 0.05`, while with no seed noise `m ≈ 10⁴` to `4·10⁶` suffices as `r` falls from 1 to 0.05; (iii) on exactly solvable quadratic GD the predicted detection probability matches simulation within 1.5 points at `T = 100, 1000, 5000`; (iv) the loss test is worth only `≈4.4` random step audits at `r = 1` and `0.16` at `r = 0.01`, so once training is floor-dominated the audits carry all deterrence. Stylised: one scalar statistic, normal approximation, known curve family.

## 1. Setup
Loss curve `L(t)` (expected held-out squared error after `t` steps), decreasing. Verifier statistic `S = ln L̂_sub − mean_k ln L̂_ref` where the reference runs use the full `T` steps. Null sd
`σ' = √(ρ_eval² + ρ_seed²)·√(1+1/k)`, with `ρ_eval² = 2/m` for `m` Gaussian evaluation samples (the estimate is `L·χ²_m/m`) and `ρ_seed` the relative run-to-run sd of the loss. Reject if `S > z_α σ'`. A worker who skips a fraction `f` shifts `E S` by `shift(f) = ln(L((1−f)T)/L(T))`, so `P_detect(f) = 1 − Φ(z_α − shift(f)/σ')`. (Jensen corrections to `E ln L̂` are second order and ignored; simulation below includes them and agrees.)

## 2. Hidden compute is the curve inverted at the noise band
Setting `P_detect = P` gives `shift(f*) = σ'(z_α + z_P)` where `z_P = Φ⁻¹(P)`; equivalently `(1−f*)T = L⁻¹(L(T)e^{σ'(z_α+z_P)})`. Nothing is assumed about `L` beyond monotonicity; the code inverts any curve by bisection. For the power law with a floor,
`shift(f) = ln(1 + r((1−f)^{−β} − 1))` and
`f* = 1 − (1 + (e^{q} − 1)/r)^{−1/β}`, `q = σ'(z_α+z_P)`.
Special cases (tested): `r = 1` gives `1 − e^{−q/β}`; small `q` gives `f* ≈ q/(βr)`; `r → 0` gives `f* → 1`. Table (E1; `β = 0.5`, `α = 0.05`, `P = ½`, so `q = 1.645σ'`):

| σ' \ r | 1 | 0.5 | 0.2 | 0.05 | 0.01 |
|---|---|---|---|---|---|
| 0.02 | 0.064 | 0.121 | 0.266 | 0.641 | 0.947 |
| 0.05 | 0.152 | 0.271 | 0.510 | 0.864 | 0.989 |
| 0.10 | 0.280 | 0.457 | 0.721 | 0.952 | 0.997 |
| 0.20 | 0.482 | 0.684 | 0.885 | 0.987 | 0.999 |

The same noise hides more compute the flatter the curve is at `T`: what matters is the *loss per step*, not the loss.

## 3. The seed-noise floor and evaluation budget
Only `ρ_eval² = 2/m` is under the verifier's control. Capping the hidden fraction at `f₀` needs `σ' ≤ ln(1 + r((1−f₀)^{−β} − 1))/(z_α+z_P)`, so
`m = 2/(σ'_max²/(1+1/k) − ρ_seed²)`, finite only when `σ'_max² > ρ_seed²(1+1/k)`. E2 (`f₀ = 5%`, `β = 0.5`, `k = 5`): with `ρ_seed = 0`, `m = 9,872 / 38,986 / 241,788 / 3,853,598` at `r = 1 / 0.5 / 0.2 / 0.05` (`m ∝ 1/r²` when `r` is small); with `ρ_seed = 0.02` no `m` works for `r ≥ 0.05` and the floor `f∞` is 7.0% / 13.2% / 28.6% / 66.7%; at `ρ_seed = 0.05` it is 16.5% to 88%. The `k` reference runs contribute the factor `1+1/k`, another floor `f∞` at unlimited data if `ρ_seed > 0`. Practical reading: to make the loss test a strong check late in training the verifier needs to shrink *seed* variance (shared init/data order, or seed-matched references), not just add evaluation data.

## 4. Check on exactly solvable GD (E3)
Full-batch GD on `½wᵀdiag(λ)w`, `λ_i = i^{−1.5}`, `d = 1000`, `w₀ ~ N(0,I)`: `w_i(t) = (1−ηλ_i)^t w_i(0)`, so `E L(t) = Σ λ_i g_i^{2t}` and the seed variance `2Σ(λ_i g_i^{2t})²` are exact sums, and the estimate on `m` samples is `L·χ²_m/m` exactly. With `m = 2000`, `k = 5`, `α = 0.05`, 4000 trials per row (E3):

| T | σ' | f* (P=½) | f = ½f*, f*, 2f*: predicted / simulated P(detect) |
|---|---|---|---|
| 100 | 0.097 | 0.322 | 0.185/0.182, 0.500/0.492, 0.996/0.985 |
| 1000 | 0.068 | 0.177 | 0.197/0.196, 0.500/0.508, 0.975/0.967 |
| 5000 | 0.065 | 0.107 | 0.202/0.202, 0.500/0.517, 0.961/0.967 |

False-positive rate at `f = 0` is 0.053, 0.050, 0.049 for nominal 0.05. The local log-log slope of this curve is not constant (0.42, 0.58, 0.95 at the three `T`; the finite spectrum bends it), yet a power law with the *local* exponent gives `f*` within 0.004 of the exact inversion, because only a short stretch of the curve matters. A single global exponent would not. The hidden fraction falls with `T` in this model (0.32, 0.18, 0.11) because the curve steepens; the floor-dominated regime of §2 needs `L∞ > 0`, which this model does not have, so it is checked only through the closed form and its tests.

## 5. Cheater economics (E4)
A worker saves `fK` by skipping (`K` = job cost) and loses stake `S` if detected: profit `fK − S·P_detect(f)`. `P_detect` is S-shaped so the best skip is a corner or the flat part of the curve; the deterring stake is `S* = K·max_f f/P_detect(f)`. With `β = 0.5`, `r = 0.2`, `ρ_seed = 0.02`, `k = 5`: `m = 200, 2000, 20000` give `S*/K = 3.17, 1.42, 1.00`; at `m = 200` a stake of `K` still pays a cheater 0.35 by skipping 60%, at `m = 2000` a stake of 3K deters everything. `S*/K = 1` is the floor: skipping everything is caught almost surely, and only the saved cost is at risk. Honest workers are slashed at rate `α` (the price of a one-sided test) unless the slash is set by a two-stage rule.

## 6. Losing to audits, and using both (E5)
`n` random step audits (drawn from the committed trace, see `spot-check-slashing`) detect a skipped fraction `f` with probability `1 − (1−f)^n` (exact hypergeometric in the code). Alone they hide `1 − 2^{−1/n}`: 12.9%, 3.4%, 0.7% for `n = 5, 20, 100`, *independent of `T` and of the loss curve*. The loss test's hidden fraction is equivalent to `n = ln(½)/ln(1−f*)` audits: 4.4 at `r = 1`, 1.4 at 0.3, 0.58 at 0.1, 0.16 at 0.01 (`σ' = 0.048`). Combined (T = 1000): the hidden fraction with five audits is 8.3% at `r = 1` but 11.9% at `r ≤ 0.03`, i.e. the loss test adds almost nothing once the curve is flat and audits do all the work. Design rule: use the loss test to bound gross shirking early (it needs no trace access and is cheap), size audits from the per-`f` target alone, and do not count on the loss for late-stage jobs.

## 7. Limits
Normal approximation (checked to within 1.5 points, worst in the tail at `f = 2f*`), known curve family (in practice `L`, `A`, `β`, `L∞` are estimated from reference runs, adding error I fold into `k`), independent evaluation and seed noise (seed noise in real runs may depend on `t`; I use the exact GD value at `T`), one shirking mode (fewer steps at the same learning-rate schedule; a cheater who shortens the schedule intelligently, or trains with a cheaper model at the same loss, is outside the analysis, see `inference-substitution`), single-round. Relations: `spot-check-slashing` (audit side), `reproducible-refereed-training` (exact re-execution), `layer-tolerance` and `conformal-tolerance` (tolerance sizing), `holdout-market` (holdout reuse). The general idea, translating a statistical noise band into compute-equivalent slack via the learning curve, appears standard in the learning-curve literature; I have not seen it applied to verification of paid training.
