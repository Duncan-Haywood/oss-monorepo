# Eliciting the tail: VaR and expected shortfall of benign drift

*Duncan Haywood. MIT licence. Code and experiments: `../src`, `../tests`, `../experiments`.*

## Abstract
Replica verification of decentralised training needs a tolerance for benign floating-point drift, and a compensation or stake level for drift beyond it. A tolerance is a quantile (VaR); compensation depends on the expected overshoot, which is the expected shortfall (ES). ES is not elicitable alone, but (VaR, ES) is jointly (Fissler–Ziegel–Gneiting). For positive losses we use the member of that family with `G₁=0`, `G₂=−ln`: `S(v,e;x) = ln e + (v + (x−v)₊/(1−α))/e − 1`, which is the Rockafellar–Uryasev objective divided by `e` and is invariant to the unit of drift. Results: (i) an explicit counterexample to convex level sets for ES alone; (ii) the expected score is `ln e + c(v)/e − 1` with `c(v)` the RU function, so the truthful pair is the unique minimiser and the excess score is `[ln(e/e*) + e*/e − 1] + (c(v)−e*)/e`, verified against quadrature to 4–5 decimals; (iii) misreporting ES by a factor `r` costs exactly `ln r + 1/r − 1` (0.307 at `r=½`, 0.193 at `r=2`), asymmetric and independent of scale; (iv) a quantile-only tolerance leaves ES/VaR = `a/(a−1)` of the tail uncovered under Pareto drift (6× at `a=1.2`); (v) auditing an ES report is expensive: about 2,000 scored samples catch a 20% understatement at Pareto index 4, 4,700 at index 3, and for index ≤ 2 the score has infinite variance and the sample-size plan is void. Stylised laws; no claim about a deployed protocol.

## 1. Setting
Let `X > 0` be the drift magnitude of a benign replica at a checkpoint, level `α` (say 0.95). `v = q_α(X)` and `e = E[X | X ≥ v] = v + E[(X−v)₊]/(1−α)`. A verifier who has run many replicas reports `(v,e)`; the protocol pays `−S(v,e;x)` against the realised drift `x` (lower score is better).

## 2. ES alone is not elicitable
Osband's principle: an elicitable property has convex level sets in the space of distributions. At `α=½` take `P₀ = δ_{1.6}` and `P₁ = 0.9δ₀ + 0.1δ₈`; both have ES 1.6, but their 50/50 mixture has ES 2.24 (E1; tested). So no scoring rule elicits ES by itself.

## 3. The score
Define `c(v) = v + E[(X−v)₊]/(1−α)`. Then `E S(v,e) = ln e + c(v)/e − 1`. Rockafellar–Uryasev: `c` is convex with minimum `ES` at `v = VaR`. For fixed `v`, the minimiser in `e` is `c(v)`; for fixed `e`, the minimiser in `v` is the VaR whatever `e` is (tested). The joint minimum is `(VaR, ES)` and its value is `ln ES`. Excess score of any report:
`E S(v,e) − E S(v*,e*) = [ln(e/e*) + e*/e − 1] + (c(v)−e*)/e.`
The first bracket is the gamma/Itakura–Saito deviance and the second is nonnegative and zero only at the VaR. Scale invariance: `S(λv,λe;λx) = S(v,e;x) + ln λ`, so rescaling drift units changes no incentive. Requires `X > 0` and finite ES.

## 4. Misreport cost
With VaR truthful, reporting `r·e*` costs exactly `ln r + 1/r − 1` (E2): 0.307 (`r=½`), 0.092 (⅔), 0.027 (0.8), 0.006 (0.9), 0.004 (1.1), 0.023 (1.25), 0.072 (1.5), 0.193 (2). Understating is costlier than overstating by the same factor. E3 checks the full law against a 100,000-point quadrature of Exp(1) at `α=0.95` for six `(v,e)` misreports; agreement is within 2·10⁻⁵.

## 5. What a quantile-only tolerance leaves uncovered
Pareto(a) drift, `α=0.99` (E4): `ES/VaR = a/(a−1)`, and the mean overshoot beyond the tolerance is `VaR/(a−1)`. Index 5, 3, 2, 1.5, 1.2 gives ES/VaR = 1.25, 1.5, 2, 3, 6. Simulated overshoot matches the formula to 1% for `a ≥ 1.5`; at `a=1.2` the sample mean (204) falls 12% short of 232 because the mean is dominated by draws too rare to appear in 3·10⁵ samples, which is itself the estimation problem of §6. A stake or compensation fund sized to the tolerance ignores this term.

## 6. Auditing an ES report
Plug-in ES from `n` scored samples (E5, `α=0.95`, relative RMSE, 300 reps, 60 at `n=6400`): index 4: 0.25, 0.09, 0.05, 0.02 for `n=100…6400`; index 2.5: 0.33, 0.21, 0.09, 0.05; index 1.5: 0.78, 2.10, 0.73, 0.24, non-monotone because the variance is infinite. To detect an understatement by scoring, the per-sample score difference has mean `ln r + 1/r − 1` and sd `√Var(Y)·|1/(re*) − 1/e*|` with `Y = v + (X−v)₊/(1−α)`, finite iff `a>2`. A one-sided CLT plan (5% size, 80% power) at `r=0.8` needs 729, 1,976, 4,703 samples for `a = 6, 4, 3`; for `r=0.9` 3,142, 8,511, 20,261 (E6). The planned spread matches simulation for `a ≥ 2.5` (E7: sd of the mean gap 0.0146 vs 0.0152 at `a=4`; 0.0321 vs 0.0345 at `a=2.5`); at `a=1.5` the empirical sd is 0.144 and the CLT prediction is infinite, and the mean gap is biased upward (0.0345 vs 0.0269). The practical consequence is that tail reports should be audited against pooled evidence or sequentially, not per checkpoint.

## 7. Limitations
(1) Losses are i.i.d. draws from a stationary law; drift depends on the operator, hardware and step (see `reproducible-refereed-training`). (2) The verifier is risk-neutral and only the report's accuracy is scored; reporting cost and abstention are ignored (`abstention-scoring`, `risk-averse-scoring`). (3) Parametric checks use Exp(1) and Pareto; a real drift law is not fitted. (4) ES is undefined for Pareto index ≤ 1; the score then has no finite optimum. (5) CLT sample sizes are planning numbers, not finite-sample guarantees, and they fail for `a ≤ 2`. (6) The score is one member of the Fissler–Ziegel family; other `G₂` trade penalty shape against scale. Contributions: the explicit scale-free score with its exact excess law, the `ln r + 1/r − 1` misreport price, the Pareto undercoverage table, and the heavy-tail audit-cost boundary at index 2. References: Osband (1985); Rockafellar & Uryasev (2000); Frongillo & Kash (2015, elicitation complexity); Fissler & Ziegel (2016); Fissler, Ziegel & Gneiting (2016).

## Reproduce
`PYTHONPATH=src python3 -m unittest discover -s tests -v` (10 tests) and `PYTHONPATH=src python3 experiments/run.py` (seeded; ~2 s).
