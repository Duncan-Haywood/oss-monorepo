# Tangent log: a bounded-payment log score for rare-fault verification

*Duncan Haywood. MIT licence. Code and experiments: `../src`, `../tests`, `../experiments`.*

## Abstract
Verifiers in a decentralised training network report the probability that a job is faulty, and faults are rare. The log score has the right incentives there (curvature `1/(p(1−p))` blows up as `p→0`) but a report of 0 on a fault costs infinity, which no stake can cover. The Brier score is bounded but its curvature is a constant 2. We extend the log generator `G(p)=p ln p+(1−p)ln(1−p)` outside `[ε,1−ε]` by its second-order Taylor polynomial. The Bregman loss of the extended, C², strictly convex generator is strictly proper on all of `[0,1]`, equals `−ln r_y+κ_ε` on `[ε,1−ε]` (constant `κ_ε<0`), and has worst-case payment exactly `R_ε=ln((1−ε)/ε)+1/(1−ε)`. Per unit of range it beats Brier by a factor 63 at truth `p=10⁻³` (ε=10⁻³), loses to Brier for `p` above a crossover with `p(1−p)=1/(2R_ε)`, and the cutoff maximising curvature per range at truth `p` is `ε=p`. This is an application of standard Bregman/proper-scoring facts (Savage, Gneiting–Raftery, Frongillo–Waggoner style generator arguments), not a new theory.

## 1. Construction
For `p∈[ε,1−ε]` use `G` itself. For `p<ε`, `G_ε(p)=G(ε)+G'(ε)(p−ε)+c(p−ε)²/2` with `c=G''(ε)=1/(ε(1−ε))`, and symmetrically above `1−ε`. `G_ε` is C² and strictly convex, so `ℓ(r,y)=G_ε(y)−G_ε(r)−G_ε'(r)(y−r)` is strictly proper: `E_p ℓ(r,·)−E_p ℓ(p,·)=D_{G_ε}(p‖r)>0` for `r≠p`. Since `G_ε(1)=G_ε(0)=κ_ε≠0`, inside the joint `ℓ(r,1)=−ln r+κ_ε`, `ℓ(r,0)=−ln(1−r)+κ_ε` (tests, error 1e-12): the score differs from log by a report-independent shift (κ=−0.025 at ε=0.05, −0.0005 at ε=10⁻³).

## 2. Bounded range
Since `G_ε'(1)=−G_ε'(0)` and `G_ε(1)=G_ε(0)`, `ℓ(0,1)=−G_ε'(0)=cε−ln(ε/(1−ε))=ln((1−ε)/ε)+1/(1−ε)=R_ε`, and this is the maximum of the loss over reports and outcomes (grid check, E1). It exceeds the plain clip `ln(1/ε)` by about 1: 7.91 vs 6.91 at ε=10⁻³. A stake `≥R_ε` scale therefore covers any report, whereas log needs unbounded stake.

## 3. Curvature per unit of range
Near the truth the excess loss is `G_ε''(p)(r−p)²/2`, so `G_ε''(p)/R_ε` measures incentive per unit of payment range; Brier (`(r−y)²`) has 2 (range 1). For `p∈[ε,1−ε]` it is `1/(p(1−p)R_ε)`; below ε it is capped at `c/R_ε`. E2 (ε=10⁻³): 126.6 at `p≤10⁻³` (63× Brier), 12.8 at 0.01, 1.41 at 0.1, 0.51 at 0.5. Tangent-log beats Brier iff `p(1−p)<1/(2R_ε)`, i.e. `p<(1−√(1−2/R_ε))/2`: 0.254, 0.147, 0.099, 0.068 for ε=0.2, 0.05, 0.01, 0.001. So the extension is a tool for rare-fault regimes, not a replacement for Brier at mid-range probabilities.

## 4. Choosing ε and misreport cost
For a truth `p`, curvature per range is maximised at ε=p (E4: p=0.001 gives 126.6, versus 111.1 at p/3 and 49.1 at 3p; grid search confirms ε*=p to 3 digits). The intuition: a smaller ε wastes range on a region where the truth never sits, a larger one flattens the curvature at p. E3 (p=10⁻³, ε=10⁻⁴): a verifier reporting `r=10⁻⁹` loses 0.0207 in expectation under log and 0.0102 under tangent-log, and `r=0` loses ∞ vs 0.0102. Overconfidence below ε therefore costs a bounded, saturating amount, which is the desired slashing behaviour but also weakens deterrence against extreme overconfidence: the excess saturates at `≈pR_ε`.

## 5. Limits
Binary outcomes only; the multiclass analogue extends `Σp ln p` in the same way but is not tested here. Truthfulness is for risk-neutral verifiers (see `risk-averse-scoring`). The score is not local to the reported probability of the realised outcome, so it cannot be used as-is with sampled audits (see `audit-weighted-scoring`). Related in this repo: `quantized-reports`, `score-recalibration`, `crps-drift-scoring`, `effort-elicitation`.
