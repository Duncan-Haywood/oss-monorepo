# A merging law for modular experts: optimal scale, 1/m error, and the limits of parallel training

*Duncan Haywood. MIT licence. Code and experiments: `../src`, `../tests`, `../experiments`.*

## Abstract
Decentralised training swarms often let many workers train modules independently and then merge them by averaging or task arithmetic. We solve the cleanest case exactly. Each of `m` modules is trained to convergence from a shared start on its own random rank-`r` task in `R^d` (tasks share a solution), and the merge is `e = e0 − aΣⱼPⱼe0`. Using only isotropy and independence, `E‖e‖² = 1 − 2amp + a²(mp + m(m−1)p²)` with `p=r/d`. The optimal scale is `a* = 1/(1+(m−1)p)` and leaves `E‖e‖² = (1−p)/(1+(m−1)p)`: plain averaging (`a=1/m`) is stuck near `(1−p)²` and unscaled task arithmetic (`a=1`) is worse than not merging once `m > 1+d/r`; at `d=32, r=4, m=64` the residual is 0.099 at `a*` against 0.767 (averaging) and 56 (sum). The decay is harmonic, `∼1/(mp)`, not geometric like `m` sequential steps `(1−p)^m` (1.9×10⁻⁴ at `m=64`). Repeated merge rounds contract by exactly this factor, so the wall-clock speedup of `m` parallel workers over sequential training is `ln(f_m)/ln(1−p)`, saturating logarithmically: 1.88, 3.38, 5.71, 8.91, 17.4× at `m=2,4,8,16,64` for `d/r=8`, with efficiency 50% at `m=20` (`d/r=8`) and `m=80` (`d/r=32`). Seen-task and fresh-task losses are closed forms; everything is verified by Monte Carlo. Stylised: linear regression, exact convergence, isotropic tasks, consistent tasks.

## 1. Model
Error `e=w−w*`, start `e0` (`‖e0‖=1`). Module `j` is trained to convergence on task `j`: `eⱼ=(I−Pⱼ)e0`, `Pⱼ` an isotropic random rank-`r` projector, independent across `j`. Merge with scale `a`: `w = w0 + aΣⱼ(wⱼ−w0)`, i.e. `e = e0 − aΣⱼPⱼe0`. The loss of task `i` is `‖Pᵢe‖²`. Same setting as `forgetting-law`, but with parallel instead of sequential composition.

## 2. Exact laws
Only `E[P]=pI`, independence, and `P²=P` are used, so no Haar fourth moments appear. Expanding, `E‖e‖² = 1 − 2aΣE e0ᵀPⱼe0 + a²ΣⱼΣₖE e0ᵀPⱼPₖe0`, diagonal terms `p`, off-diagonal `p²`:
`N(a) = 1 − 2amp + a²(mp + m(m−1)p²)`.
Minimising: `a* = 1/(1+(m−1)p)`, `N(a*) = (1−p)/(1+(m−1)p)`. (Same shape as the extremisation in `expert-pooling`: the terms `(m−1)p` play the role of correlation `(n−1)ρ`.) Seen-task loss (task 1 of the `m`): `P₁e = (1−a)P₁e0 − aΣ_{j≥2}P₁Pⱼe0`, and taking expectations (`E[PⱼP₁Pⱼ]=pPⱼ`, distinct `j≠k` give `p³`):
`S(a) = (1−a)²p − 2a(1−a)(m−1)p² + a²(m−1)(p² + (m−2)p³)`.
A fresh task independent of the merge has loss `pN(a)`. At `m=1,a=1` these give `1−p`, `0`, `p(1−p)`, the single-task values.

## 3. Results
E1 (`d=12, r=3, m=4`, 20000 runs; law / simulation): averaging `a=¼`: `‖e‖²` 0.6094/0.6090, seen 0.0879/0.0879, fresh 0.1523/0.1523. `a*=0.571`: 0.4286/0.4279, 0.0459/0.0460, 0.1071/0.1066. `a=1`: 0.7500/0.7525, 0.2812/0.2832, 0.1875/0.1886. E2 (`d=32,r=4`): at `m=8` the residual is 0.467 at `a*`, 0.779 averaging, 0.875 summing, and the sequential value 0.344; at `m=256` averaging is still 0.766 (it converges to `(1−p)²=0.766`, so adding modules under plain averaging buys nothing after a few) while `a*` gives 0.027 and the sum explodes (989). The optimal scale is 0.53 at `m=8` and 0.113 at `m=64` (`≈1/(mp)` for `m ≫ d/r`). E5: at `m=8` the loss on the merged tasks and on a fresh task are both minimised near `a*` (seen 0.0272, fresh 0.0583), while `a=1` gives 0.191 and 0.109: merging without scaling *forgets the merged tasks* more than it learns them.

## 4. Parallel speedup
Isotropy makes each merge round independent of the current error direction, so `k` rounds of `m` fresh workers contract `E‖e‖²` by `f_m=(1−p)/(1+(m−1)p)` per round; E3 (`d=12, r=3, m=5`, 8000 runs) matches `f_m^k` (0.3750/0.3734 at `k=1`, 0.0028/0.0028 at `k=6`). Sequential steps contract by `(1−p)` each, so the speedup at any target is `S_m = ln f_m / ln(1−p) = 1 + ln(1+(m−1)p)/(−ln(1−p))`, independent of the target. It is below `m` and grows only like `ln(mp)/p`: `(d,r)=(32,4)`: 1.88, 3.38, 5.71, 8.91, 17.35 at `m=2,4,8,16,64`; `(32,1)`: 1.97, 3.82, 7.23, 13.1, 35.3. Efficiency `S_m/m` falls to ½ at `m=20` for `r/d=1/8`, `m=80` for `1/32`, `m=161` for `1/64`, and to ¼ at `m=72, 297, 596`: the critical worker count scales with `d/r`, the number of independent directions a task leaves free (a critical-batch-size law for module merging).

## 5. Limits and next steps
Linear regression with exact convergence; consistent tasks (conflicting tasks add a `τ²`-type interference floor, as in `forgetting-law` §5, and should shift `a*` down); isotropic tasks (anisotropic task distributions change the effective `p` per direction); no nonlinear features or SGD noise. A verifier hook: a claimed merge can be checked cheaply against `N(a*)` on replayed tasks, and the optimal scale `a*` is computable from `(d,r,m)` alone. Related: `forgetting-law`, `local-sgd-bias`, `expert-pooling`, `wagering-modular-experts`.
