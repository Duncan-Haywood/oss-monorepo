# Eliciting the modal drift of a verifier population: the window loss

*Duncan Haywood. MIT licence. Code and experiments: `../src`, `../tests`, `../experiments`.*

## Abstract
When a fraction of workers cheats, honest drift and cheating drift form a mixture and the mean, which squared loss elicits, lands between them where almost no task actually lies. The mode is the natural summary but is not elicitable; the α-mode, the centre of the width-`2α` window with the most probability mass, is, with the bounded loss `1[|y−r|>α]`. Its regret is exactly a window-mass difference `M(r*)−M(r)`. For a single symmetric law the regret near the mode is `δ²·αφ(α/σ)/σ³`, maximised at `α=σ` (normal) and `α=γ/√3` (Cauchy, where squared loss has no mean to elicit). For an equal mixture of two normals at separation `μ>2σ` the α-mode is a single point iff `α≥α*`, the root of `ln((a+α)/(a−α))=2aα/σ²` with `a=μ/2` (≈`μ/2` for `μ≥6σ`). Against 10–40% contamination at 5σ the sample α-mode has bias ≈0.0 where the mean has `5ε`, at 3.7× the mean's RMSE without contamination.

## 1. Setup
Drift `Y` (difference between a worker's result and the reference) has law `F`. A verifier reports `r`, paid loss `1[|y−r|>α]`. Expected loss is `1−M(r)` with `M(r)=F(r+α)−F(r−α)`, so the optimal report is `argmax M`, the α-mode, and regret is `M(r*)−M(r)∈[0,1]` (strictly proper when the maximiser is unique; tested on a bimodal mixture, all regrets positive off the mode, zero at it). This is the property-elicitation view (Frongillo): the mode fails, its smoothed version passes.

## 2. Mean versus α-mode under bimodal drift
For `0.7N(0,1)+0.3N(μ,1)`, α=1 (E1): at μ=6 the mean sits at 1.8 and a window there holds mass 0.147, against 0.478 at the α-mode (≈0); at μ=10 the mean's window holds 0.016. Reporting the α-mode costs squared loss regret `(0.3μ)²` (0.72 at μ=3, 9 at μ=10): the two losses elicit different things and a referee must pick the one that matches its decision (tolerance threshold vs. total drift budget).

## 3. Best window
Near a symmetric unimodal mode `M''(0)=2f'(α)`, so regret `≈δ²·(−f'(α))` (matches exact regret to 0.1% at δ=0.01). Normal: `αφ(α/σ)/σ³`, maximum `φ(1)/σ²=0.242/σ²` at `α=σ`; a window at 0.25σ keeps 40% of the incentive, 4σ keeps 0.2% (E3). Cauchy scale γ: `2α/(πγ³(1+α²/γ²)²)`, maximum 0.207/γ² at `α=γ/√3` (0.577γ). The loss range is 1 by construction, so these are per unit of payment range.

## 4. When is the α-mode one point?
Take `½N(0,σ²)+½N(μ,σ²)`. By symmetry `μ/2` is a critical point of `M`, and `M''(μ/2)∝f'(a+α)−f'(a−α)` (a=μ/2) vanishes iff `ln((a+α)/(a−α))=2aα/σ²`. For `μ≤2σ` the mixture is unimodal for every α. For `μ>2σ` the root `α*` separates a window too narrow to bridge the gap (two symmetric α-modes, the report is ambiguous and jumps discontinuously with the weights) from one that averages them: `α*=1.10, 1.46, 2.00, 3.00, 5.00` for `μ=2.5,3,4,6,10` (E2, verified by maximising `M` at 0.9α* and 1.1α*). For large μ, `α*→μ/2`: only a window that spans the gap merges the modes. A tolerance should be chosen below α* to detect a cheating mode and above it to summarise the whole population.

## 5. Detection and estimation
Paired loss difference `L(r)−L(r*)∈{−1,0,1}` has mean equal to the regret and variance `P(±1)−regret²` from window masses and their overlap (matches 2·10⁵ simulations to 0.01). For `0.7N(0,1)+0.3N(4,1)` a report shifted by 1 needs `n=45` tasks (z=1.645) and one shifted by 0.25 needs 2165 (E4). Estimation from n=2000 samples with contamination ε at +5σ (200 runs, E5): mean bias `5ε` (0.50 at ε=0.1, 2.0 at 0.4), α-mode bias ≤0.015 in size; but at ε=0 its RMSE is 0.078 against 0.021 for the mean, a 3.7× efficiency price for robustness.

## 6. Limits
Risk-neutral verifiers, known location family, α fixed in advance and known to the verifier, one report per task. The empirical α-mode is exact but no rate is proved here (a cube-root rate is the classical mode-estimation result, not established for this loss). Related in this repo: `property-elicitation-verification`, `tail-risk-elicitation`, `robust-aggregation`, `variance-elicitation`.
