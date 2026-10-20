# The conflict floor of routed modules is the router's Gini impurity

*Duncan Haywood. MIT licence. Code and experiments: `../src`, `../tests`, `../experiments`.*

## Abstract
`forgetting-law` showed that when continual-learning tasks conflict, a shared linear model forgets down to a floor `2rτ²/d` that only task-specific modules remove, and left open what a *task-aware router* buys. We answer it exactly in the cleanest cluster model: task optima are `w* + μ_c + ε` with `K` cluster centres of variance `τ_b²` and idiosyncratic offsets of variance `τ_w²`, and a router sends each task to one of `M` modules. The expected loss on a task learned long ago is `(2r/d)[τ_w² + τ_b²(1 − Purity)]`, where `Purity = Σ_g P(g) Σ_c P(c|g)²` is the expected within-module cluster concentration, i.e. one minus the router's Gini impurity. Consequences: random routing to any number of modules leaves the whole floor; a perfect router onto `m` modules that partition `K` uniform clusters removes exactly `(m−1)/(K−1)` of the between-cluster floor, one module at a time; a routing error rate `q` costs `2q` of impurity at first order (at `K=8`, 10% error gives back 36% of the shared floor, 25% error gives back 59%); and purity is auditable with an unbiased pair-collision estimator. The law matches simulation within 0.3–2.3% across six routers at `d=12, r=3` and within 2.1% for a non-uniform prior with an asymmetric router. Stylised: linear regression, exact convergence, Haar-random subspaces, Gaussian cluster centres.

## 1. Model
As in `forgetting-law`, the error `e = w − w*` of a module is updated by training to convergence on task `j`: `e ← (I−Πⱼ)e + Πⱼδⱼ`, with `Πⱼ` a Haar-random rank-`r` projector and `δⱼ` the task's optimum offset. Offsets are `δⱼ = μ_{c(j)} + εⱼ`, `μ_c ~ N(0, τ_b²I/d)` fixed for the run, `εⱼ ~ N(0, τ_w²I/d)`. A router sends a cluster-`c` task to module `g` with probability `R[c][g]`; clusters have prior `u`. Each module then sees a stream of offsets whose cluster mix is `π_g(c) = P(c|g)`.

## 2. The law
Let a module's offset stream have mean `m` and total variance `s²`. Write `e = m + f`: then `f' = (I−Π)f + Π(δ−m)`, and since `Π` is independent of `f` and `δ−m` is zero-mean, `E‖f'‖² = ρE‖f‖² + (r/d)s²` with `ρ=1−r/d` (using `E[I−Π]=ρI` and `E‖Πv‖²=(r/d)‖v‖²`). The stationary value is `E‖f‖² = s²`, *exactly*, for any stream covariance (this generalises the isotropic floor in `forgetting-law` §5, which was derived by symmetry). A task learned long ago is (asymptotically) independent of the module's current error, so its loss is `(r/d)(E‖m−δⱼ‖² + s²)`.
For iid centres, with `m_g = Σ_k π_g(k)μ_k`: `E‖μ_c − m_g‖² = τ_b²(1 − 2π_g(c) + Σ_kπ_g(k)²)` and `s_g² = τ_w² + τ_b²(1 − Σ_kπ_g(k)²)`. The `Σπ²` terms cancel, leaving for a cluster-`c` task on module `g`
`(r/d)[2τ_w² + 2τ_b²(1 − π_g(c))]`.
Averaging over the router, `Σ_{c,g}u_cR_{cg}π_g(c) = Σ_g P(g)Σ_cπ_g(c)²`:

`floor = (2r/d)[τ_w² + τ_b²(1 − Purity)]`.

One shared module has `Purity = Σu²` (`1/K` for uniform clusters), recovering `2rτ²/d` with `τ² = τ_w² + τ_b²(1−1/K)`; a perfect router has `Purity = 1` and leaves the within-cluster conflict `2rτ_w²/d`, which no routing by cluster can remove.

## 3. Simulation
E1 (`d=12, r=3, τ_w²=0.2, τ_b²=1, K=4`, 3000 runs, 40 burn-in and 40 lag tasks): law/simulation are 0.4750/0.4766 for one shared module, 0.4750/0.4766 for four modules with random routing (identical: each module sees the full stream), 0.3500/0.3579 for a 2-module block router, 0.1933/0.1916 (`q=0.1`), 0.3400/0.3385 (`q=0.3`), 0.1000/0.1012 for a perfect router. E2 (`d=8, r=2`, `K=3`, prior `(0.6,0.3,0.1)`, asymmetric 2-module router): 0.3150/0.3118, and the shared model 0.4200/0.4110. Errors are within Monte Carlo noise (~1.5%).

## 4. What routing buys
**Random modularity is free of benefit at the floor** (E3): 1–8 modules with random routing all sit at 0.2687 at `d=32, r=4, K=8`. In the consistent-task regime random modularity buys short-horizon insurance (`forgetting-law` §4); under conflict it buys nothing, because every module still sees the full mixture.
**Linear returns to modules.** A perfect block router on `m` modules removes `(m−1)/(K−1)` of the between-cluster floor: 50% needs `m=5` of 8 clusters and 90% needs all 8. There is no diminishing return to exploit; a router that can only separate a few coarse groups gets a proportional share.
**Router error is expensive at first order** (E4): impurity `= 2q − q²K/(K−1)`, slope 2 at `q=0`. At `K=8`, `q = 0.02, 0.05, 0.1, 0.25` puts the floor at 22%, 28%, 36% and 59% of the shared-model ceiling (the perfect router sits at 19%). A router's routing accuracy is therefore worth auditing as carefully as the modules' training.

## 5. Auditing the router
Impurity is the probability that two tasks routed to the same module belong to different clusters. From `n` cluster-labelled tasks on a module, `Σ_c n_c(n_c−1)/(n(n−1))` is exactly unbiased for `Σπ²` (checked by enumeration in the tests). E5: on a module with `π=(0.8,0.1,0.1)` (true purity 0.660) the estimator has mean 0.656–0.663 and standard deviation 0.26, 0.18, 0.10, 0.056, 0.033 at `n=5, 10, 30, 100, 300`. A verifier who can label a few hundred tasks per module can therefore bound the floor a claimed routing design will incur, complementing the trace audits in `forgetting-audit` and `replay-law`.

## 6. Limits and next steps
Hard routing with a known confusion matrix; the centres are iid Gaussian, so the law is an average over cluster geometry (a fixed geometry would replace `1−π_g(c)` terms by the actual distances, which we did not simulate); the router is not learned, and the price of learning it (bandit or wagering routers, `wagering-modular-experts`, `market-routing`) is not included. Modules are parameter-expensive (`d` each): the linear-return law makes the cost–benefit an exact knapsack over `m`. Transient convergence to the floor takes `~log(1/tol)/log(1/ρ)` visits per module, i.e. `M` times longer in stream time. Related: `forgetting-law`, `merge-law` (merging modules instead of routing), `replay-law`, `sleeping-ledger`.
