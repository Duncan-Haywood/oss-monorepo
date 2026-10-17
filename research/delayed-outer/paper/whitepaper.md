# Delayed outer updates in local SGD: how much step does overlapping communication cost?

*Stylised: independent quadratic modes, Gaussian gradient noise, identical workers, a constant delay of `τ` rounds, fixed outer step `α`, no momentum. Pure Python; every formula is checked against a literal simulation (`tests/`, `experiments/results.txt`).*

## Question
Over a wide-area, permissionless network the outer synchronisation of DiLoCo-style training takes longer than the inner compute. Streaming and overlapped variants hide that latency by applying the averaged displacement `τ` rounds late, so workers always start from a stale global model. `noisy-local-sgd` gave the noise floor with `τ = 0`. What does a delay do to the stable outer step, the convergence rate and the noise floor, and how many rounds should be kept in flight?

## Model
Mode `j` has curvature `a_j`. A worker started from a model runs `H` inner steps of size `η` with noise `σ²` and returns `q^H x + n` (`q = 1−ηa`, `Var n = V_w`, outer curvature `s = 1−q^H`). The server averages `N` workers and the workers start from the model of `τ` rounds ago:

`x_{t+1} = x_t − c·x_{t−τ} + e_t`, `c = αs`, `Var e = α²V_w/N`.

## Exact results
1. **Stability: `c < 2 sin(π/(4τ+2))`.** The characteristic polynomial is `z^{τ+1} − z^τ + c`; the spectral radius crosses 1 exactly at that `c` (checked to ±0.1% for `τ = 0…16`). The limit is 2, 1, 0.618, 0.445, 0.285, 0.185, 0.095 at `τ = 0, 1, 2, 3, 5, 8, 16` and tends to `π/(2τ+1)`: **the usable outer step shrinks like `1/τ`**, not slightly. For the stiffest mode of the test problem (`s = 0.59`) `α_max` falls from 3.39 to 1.69 at `τ=1` and 0.16 at `τ=16`.
2. **Exact noise floor.** The stationary variance solves a `(τ+2)`-equation Yule–Walker system, closed forms `e²/(c(2−c))` at `τ=0` and `e²(1+c)/((1−c)c(2+c))` at `τ=1`. It matches a literal simulation (workers running `H` noisy SGD steps from the stale model, 300 000 rounds) within 0.3% for `τ = 0, 1, 2, 4` and `α = 0.4, 0.8`. The floor multiplier from one round of delay is `(1+c)(2−c)/((1−c)(2+c))`: 1.05× at `c=0.05`, 1.23× at 0.2, 1.8× at 0.5, 3.9× at 0.8, 13.9× at 0.95, divergent at 1.
3. **Delay is free for small steps.** At `α = 10⁻³` the floor with `τ = 4` is within 1% of `τ=0`. The penalty is a large-step phenomenon, so it lands on configurations that were using `α` near the no-delay limit.
4. **Fastest deterministic rate.** A single mode is fastest at the double root `c* = τ^τ/(τ+1)^{τ+1}` with radius `τ/(τ+1)` (0.5, 0.667, 0.75, 0.833, 0.889 for `τ = 1,2,3,5,8`; 10 → 58.6 rounds to shrink 1000×). Deviating by ±30% in `c` is worse in both directions. So delay also cuts the best achievable per-round contraction to `1 − 1/(τ+1)`.
5. **Wall-clock: hide exactly the latency, no more.** With `τ+1` rounds in flight a round takes `max(T_c, (T_c+L)/(τ+1))`. At the *same* stationary loss (`α` the largest step meeting `F`; three modes `a = 1, ¼, 0.05`, `η=0.2`, `H=4`, `N=8`), each extra delay round costs only ≈6% more rounds for small `τ` (581 → 617 → 654 rounds at `τ = 0,1,2`; 1290 at `τ=16`), so the best delay is **`τ* = ⌈L/T_c⌉`** in every case tested (`L/T_c = 0,1,3,7,15` gives `τ* = 0,1,3,7,15`), with speed-up over no overlap of 1.00×, 1.88×, 3.36×, 5.44×, 7.51× (wall-clock 4647 → 855 at `L/T_c=7`). Any delay beyond `τ*` buys no time and costs rounds (`τ=16` at `L/T_c=15`: 1290 vs 1238).

## Limitations
Constant delay (real systems have jitter and stragglers, see `stale-rollouts`, `delayed-routing`), identical workers and curvatures (no client drift), quadratics, no outer momentum (`outer-momentum` shows momentum changes the stability picture; combining it with delay needs a bigger characteristic polynomial), noise independent of staleness, and that `τ* = ⌈L/T_c⌉` is an observed optimum over the parameter grid, not a proved theorem.

## Relevance
For bandwidth- and latency-bound open training networks: decide the delay from measured `L/T_c` rather than by default; set the outer step below `π/((2τ+1)s_max)` before enabling overlap (this is the sharp line at which a previously stable run diverges); expect little noise-floor penalty if `α` was already small; and do not over-delay. Companion to `noisy-local-sgd`, `outer-momentum`, `compressed-sync`, `partial-participation`, `local-sgd-bias` and `stale-rollouts`.
