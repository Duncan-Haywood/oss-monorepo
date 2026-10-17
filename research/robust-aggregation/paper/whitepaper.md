# How much can β Byzantine verifiers move an aggregate?

*Working note, MIT licensed. Stylised; pure-Python numerical checks, no claims about any deployed protocol.*

## Motivation
Verification protocols (`verification-game`, `verifier-bribery`, `decision-regret-transfer`) aggregate verifiers' scalar reports (a loss estimate, a drift measurement).
Property elicitation says which statistics can be elicited (mean via squared loss, median via absolute loss); this note asks which is *robust* when a fraction β of reports is adversarial.

## Model (`src/robust_aggregation/model.py`)
Honest reports are N(0, σ²), a fraction β are placed by the adversary; the worst case for one-sided damage is all Byzantine mass at +B.

## Results (`experiments/results.txt`)
**R1 (mean has no robustness).** Bias is βB, unbounded in B (E1: 5·10⁴ at β=0.05, B=10⁶).

**R2 (median bias is bounded and independent of B).** The population median solves (1−β)Φ(q/σ)=½, so **bias = σ·Φ⁻¹(1/(2(1−β)))**: 0.066σ at β=0.05, 0.31σ at 0.2, 0.97σ at 0.4, diverging as β→½ (breakdown point ½). Simulation (n=2001) matches closed form to within 0.006, and is identical for B=10² and 10⁶ (E1, E2).

**R3 (trimmed mean).** For τ ≥ β, keeping honest quantiles a=τ/(1−β) to b=1−(τ−β)/(1−β) gives **bias = (1−β)σ(φ(z_a)−φ(z_b))/(1−2τ)**, matched to simulation within 0.004 for n=6000 (three larger-τ cases; 0.004 at β=τ=0.05, a finite-sample edge effect). Larger τ tends to the median's bias. For τ<β the adversary escapes trimming and the bias is again unbounded (E4: 5.6·10⁴).

**R4 (deterministic bracket).** For any adversarial values, f<(n+1)/2 Byzantine reports and odd n, the median lies between honest order statistics h₍k−f₎ and h₍k₎ with k=(n+1)/2 (tested on 500 random instances), so the median is always inside the honest range widened by f ranks.

## Implications
A protocol that elicits the *mean* of verifier reports (squared-loss scoring) inherits R1; one that scores with absolute or pinball loss (median/quantile) inherits R2 and pays for it in variance without attack. Trimming must be set at or above the assumed β, which couples to the collusion-proof stake analysis in `verifier-bribery`.

## Limits
Gaussian honest noise, one-sided adversary, i.i.d. reports, no incentive analysis of the scoring itself (an open link to Frongillo–Waggoner-style elicitation under adversaries).
