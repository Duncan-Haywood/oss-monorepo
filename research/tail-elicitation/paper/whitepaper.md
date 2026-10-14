# Eliciting the Tail of Benign Drift: A Proper Score for (VaR, Expected Shortfall) in Verifier Tolerance Forecasts

*Stylised model; MIT licensed. Code: `src/tail_elicitation`, results: `experiments/results.txt`.*

## Abstract
Refereed verification of decentralised training must set a tolerance for benign floating-point drift between replicas (see `reproducible-refereed-training`, `property-elicitation-verification`). A tolerance is a quantile, but the cost of a wrong tolerance depends on how bad the tail beyond it is — expected shortfall (ES). We ask how to pay verifiers for honest forecasts of both. Three results. (i) A one-line 0-homogeneous member of the Fissler–Ziegel family, `S(v,e,y) = ln e − 1 + (v + (y−v)₊/(1−τ))/e`, is minimised exactly at (VaR_τ, ES_τ); its profile over `e` is `ln` of the Rockafellar–Uryasev objective, so the minimum score is `ln ES`. (ii) ES alone is not elicitable (non-convex level set, verified by an explicit mixture), and pinball loss cannot see ES at all. (iii) The excess expected score of misreporting has exact closed forms, yielding sample-size rules: a forecaster with the right VaR and ES 30% low is separated from the truth by ≈0.6–1.2k drift observations at τ=0.9–0.95, ≈4–7k at τ=0.99.

## 1. Setting
Benign drift Y>0 has law F. For level τ (e.g. 0.99), VaR `v* = F⁻¹(τ)` and `ES* = E[Y | Y ≥ v*] = min_v m(v)`, `m(v) = v + E(Y−v)₊/(1−τ)` (Rockafellar–Uryasev). A verifier reports (v, e) before observing y and is paid `−S`. Setting the audit tolerance at `v` controls the false-slash rate (1−τ); `e` prices the loss from drifts that exceed it, e.g. how large a stake must be to survive honest tail events.

## 2. The score
`S(v,e,y) = ln e − 1 + (v + (y−v)₊/(1−τ))/e + λ(1{y≤v}−τ)(v−y)`, λ≥0.
For fixed `v`, `E S = ln e − 1 + m(v)/e` is minimised at `e = m(v)` with value `ln m(v)`, and `min_v ln m(v) = ln ES*` at `v = VaR`. Hence (VaR, ES) is the unique minimiser for every λ≥0 (checked on finite laws by dense search, `test_joint_minimiser_is_var_es`, τ∈{0.7,0.9,0.97}, λ∈{0,0.5,2}). The λ=0 score is homogeneous of degree 0 up to `ln` of the scale (`S(cv,ce,cy) = S(v,e,y)+ln c`), so payments do not depend on the units of drift — useful because drift scales with layer width and dtype. It is the Fissler–Ziegel form with G₁=0 and G₂=−ln.

## 3. What fails
*ES alone.* `ES` is concave in the law (a min of linear functionals), so its level sets are not convex, which by Osband's necessary condition rules out any proper score for ES by itself. Explicit: τ=0.9, P₀=(0 w.p. ½, 10 w.p. ½), P₁=(0 w.p. .95, 20 w.p. .05) both have ES 10; their 50/50 mixture has ES 12.5 (test `test_es_alone_not_elicitable`). ES is elicitable only jointly with (or conditionally on) VaR — elicitation complexity 2.
*Pinball alone.* It has no `e` argument, so any two forecasters with equal VaR score identically: every ES claim is free.

## 4. Exact regret
Excess expected score relative to the truth, λ=0:
- ES misreport `e = r·ES*` at the true VaR: `ln r + 1/r − 1` (Itakura–Saito; ≈(r−1)²/2). r=0.7 → 0.0719, r=0.5 → 0.3069; asymmetric — under-reporting the tail by half costs 4× over-reporting by 50% (0.072).
- VaR misreport `v` with ES right: `(1/(ES*(1−τ)))∫_{v*}^{v}(F(t)−τ)dt` (exact on finite laws, error 1e-10; `test_excess_v_closed_form`).
Both are Bregman-type divergences, non-negative, zero only at the truth.

## 5. Sample complexity of catching a low tail claim
Paired score difference between a forecaster with correct VaR and ES×r and the truth, mean ≈ `ln r + 1/r − 1`, noise dominated by rare tail draws. Samples for mean ≥ 2 s.e. (`4 sd²/mean²`, 200k simulations):

| law, τ | r=0.9 | r=0.7 | r=0.5 |
|---|---|---|---|
| lognormal σ=1, 0.90 | 7.3k | 804 | 227 |
| lognormal σ=1, 0.95 | 12k | 1.2k | 371 |
| lognormal σ=1, 0.99 | 66k | 3.7k | 1.2k |
| Pareto α=3, 0.90 | 6.9k | 566 | 179 |
| Pareto α=3, 0.95 | 10k | 1.1k | 345 |
| Pareto α=3, 0.99 | 65k | 6.8k | 1.5k |

Cost grows roughly like `1/(1−τ)` (only ~(1−τ)n observations touch the tail), so 99th-percentile claims are expensive to audit and a 10% understatement is nearly unidentifiable below 10⁴–10⁵ samples. At τ=0.99 the sampled mean drifts from theory (0.0834 vs 0.0719 at r=0.7) because 200k draws contain only ~2k tail events; treat the τ=0.99 rows as ±20%.
*Quantile-part weight.* Adding λ·pinball leaves the ES-misreport difference identical (the term cancels), and when VaR is misreported scales signal and noise by the same factor, so `n` is unchanged (1,458 for all λ∈{0,0.25,1,4}). The simple λ=0 score loses nothing.

## Limitations and relevance
Drift is treated as i.i.d. with a positive law; real tolerance forecasts are conditional on layer, dtype and hardware, so the practical object is a stream of scores with covariates. The score is a proper scoring rule, not an incentive-compatible contract: effort costs and the interaction with stake are in `effort-elicitation` and `effort-contracts`. ES requires a finite mean (Pareto α>1) and the score's variance a finite second moment (α>2 here); for heavier tails use VaR-only rules. Relevance: Gensyn's verification line (Verde, RepOps) makes drift bounded but nonzero; paying for calibrated *tail* forecasts gives a principled way to set tolerance and stake and to audit forecasters, extending Frongillo–Kash elicitation-complexity ideas to a concrete verification cost.

## Reproduce
`PYTHONPATH=src python3 -m unittest discover -s tests` (10 tests) and `PYTHONPATH=src python3 experiments/run.py`.

## References

- Fissler, T. and Ziegel, J. F. (2016). Higher order elicitability and Osband's principle. *Annals of Statistics* 44(4), 1680–1707. (The score family used in the joint (VaR, ES) result.)
- Rockafellar, R. T. and Uryasev, S. (2000). Optimization of conditional value-at-risk. *Journal of Risk* 2(3), 21–41. (The objective `m(v)`.)
- Gneiting, T. (2011). Making and evaluating point forecasts. *Journal of the American Statistical Association* 106(494), 746–762. (ES alone is not elicitable.)

## AI assistance

This white paper and its code were produced with AI assistance. All numbers come from `experiments/results.txt`, regenerated by `experiments/run.py`; the work is stylised and has not been peer reviewed.
