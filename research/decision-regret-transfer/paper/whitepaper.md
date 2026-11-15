# From scoring-rule loss to decision regret: certificates for accept / audit / slash

*Working note, MIT licensed. Stylised; numerical experiments in pure Python, no claims about any deployed protocol.*

## Motivation
Earlier notes in this repo pay verifiers with proper scoring rules (`effort-elicitation`, `effort-contracts`, `quantized-reports`).
A protocol designer ultimately cares about a *decision*: accept a claimed training result, audit it, or slash the worker. This note asks the
question studied for surrogate losses (Bartlett–Jordan–McAuliffe; Frongillo–Waggoner on polyhedral surrogates and regret transfer) in the
verification setting: **if a verifier's excess score is s, how much decision cost can the protocol have lost?** and turns the answer into
a computable certificate.

## Prior work and what is new
For two actions the answer is known. Reid & Williamson ("Surrogate regret bounds for proper losses", ICML 2009; "Information, divergence and risk
for binary experiments", JMLR 12, 2011) show that the tight regret bound of a proper loss for a cost-weighted decision at threshold τ is its Bregman
divergence at τ, which is R1 below. Steinwart ("How to compare different loss functions and their risks", Constructive Approximation 26, 2007)
defines the calibration function δ used here and its convexified inverse for averages. The audit band is a reject option: Chow ("On optimum
recognition error and reject tradeoff", IEEE Trans. Inf. Theory 16, 1970) gives its Bayes rule; Bartlett & Wegkamp (JMLR 9, 2008) and Ramaswamy,
Tewari & Agarwal (Electronic Journal of Statistics 12, 2018) give surrogate calibration with abstention, on the polyhedral side (see `reject-surrogates`).
What this note adds is narrower: the exact calibration function of *strictly proper* scores for the three-action accept/audit/reject decision with
asymmetric costs (A ≠ R), computed by bisection, a construction of ψ that is a valid lower bound on δ by design (the naive grid hull is not; see Limits),
and the numbers for the verification setting (R2, R4). It is a computational tool and a worked application, not a new theorem.

## Model (`src/decision_regret_transfer/model.py`)
True fault probability η; verifier reports q; the protocol acts as if q were true. Costs: accept Aη, reject R(1−η), audit c. The Bayes
regions are accept on [0, c/A], audit on [c/A, 1−c/R], reject on [1−c/R, 1] (binary with threshold τ = R/(A+R) when audit is never optimal).
A strictly proper score has excess score D(η, q), the Bregman divergence of its potential: (η−q)² for Brier, KL(η‖q) for log.

**Calibration function.** δ(ε) = min{D(η,q) : decision regret at (η,q) ≥ ε}. Because acting on q is optimal iff q is in the region,
the inner minimum is D(η, clip(η, region)), and the outer one is found by bisection on the convex piecewise-linear regret. So the pointwise transfer
is *exact*, not a bound, and is attained by a verifier sitting on the tight pair. Averages transfer through any convex nondecreasing ψ ≤ δ (Jensen):
**E[regret] ≤ ψ⁻¹(E[excess score])**, a certificate computable from a validation score alone. The code builds ψ as the lower convex hull of the corners
(x_k, δ(x_{k−1})) of a step function below δ on a grid x_0 = 0 < x_1 < … (400 uniform steps of the regret range plus a geometric ladder of ratio 0.9 towards 0),
so ψ ≤ δ holds by construction and the certificate exceeds the best possible one by at most one grid step.

## Results (`experiments/results.txt`)
**R1 (closed forms).** Binary, regret |η−τ| (A+R=1): Brier gives δ(ε)=ε², log gives δ(ε)=KL(τ+ε‖τ) (matches the code to 9 digits; at τ=½ this is ≈2ε²,
at small τ ≈ε²/(2τ(1−τ)) but KL is smaller than this quadratic for larger ε: at τ=0.02, ε=0.05 it is 0.039 vs 0.064, E1). Exact δ agrees with a 1500² brute-force grid
to within grid error (test).

**R2 (rare faults change the log-score transfer).** At a fixed excess of 0.01 nats the log-score decision-regret certificate falls from 0.072 at A/R=1 to
0.025 at A/R=50 and 0.014 at A/R=200 (E2), roughly √(2τ(1−τ)s) but 2–43% above it, more at small τ. The Brier certificate is 0.1012–0.1025 (√s = 0.1 plus
one grid step) regardless of τ.
These are different units (nats vs squared error), so this compares each rule's own guarantee, not the rules.

**R3 (polyhedral surrogates transfer linearly).** For the cost-weighted hinge (ℓ(f,fault)=(1−τ)(1−f)₊, ℓ(f,ok)=τ(1+f)₊) excess risk ≥ decision regret on the wrong side, with
ratio →1 (E3, all τ), i.e. δ(ε)=ε against ε² for Brier. But hinge scores are not strictly proper, so they do not elicit a probability that can be paid for or audited-priced;
in this stylised model the price of an incentive-compatible probability report is a square-root loss of guarantee (ε ≤ √s), not a free lunch either way.

**R4 (an audit action tightens the certificate).** Adding an audit band at A=R=1 raises the Brier δ(0.1) from 0.0025 to 0.0100 and the log δ(0.1) from 0.0050 to
0.0204–0.0444 depending on c (E4). A given decision regret then needs *more* excess score, so the same measured score certifies a smaller worst-case loss: the audit option
hedges near-threshold errors, and only a miscalibration large enough to jump a whole band costs the full accept/reject regret.

**R5 (certificates hold, and are loose on realistic verifiers).** With η∼Beta(2,5) and five miscalibration modes, realised regret is 8–26% of the certificate for both rules (E5).
The worst case is a point-mass verifier at a tight pair: at τ=0.1 it has excess log score δ(0.05) = 0.012235 and regret 0.05, and the certificate is 0.0522 (E6). Over 12,252 such pairs
(six cost settings, both rules, ε from 10⁻⁶ to 1 times the maximum regret) the certificate is never below the realised regret and at most 1.11 times it (E7, unit-tested).
So the bound is a worst-case guarantee, tight to one grid step, not a forecast.

## Implications
1. A validation score converts to a cap on excess decision cost (valid under the model's assumptions: known costs, a report acted on directly): compute ψ from (A, R, c), read off ψ⁻¹(measured excess score). Use it to set score-quality SLAs for verifiers.
2. Under log score, the more lopsided the costs (rare, expensive faults) the smaller the regret a given nat-gap can hide. This compares one rule's guarantee across cost ratios;
it does not show log score beats Brier, since a nat and a unit of squared error are different scales (R2).
3. Optimising a smooth proper score gives ε² transfer; if only the decision is needed, polyhedral surrogates give linear transfer but cannot be paid as probability reports.
4. `reject-surrogates` studies the polyhedral side of the same accept/reject/escalate decision (linear transfer, a training-side view); this note is the proper-score side (a certificate for a verifier that is already paid by a proper rule).
5. Combine with `effort-contracts`: the scale on the scoring rule sets both incentive strength and, through this note, the decision loss per unit of effort shortfall.

## Limits
Binary fault variable, known costs, a verifier report that is directly acted on (no aggregation across verifiers; see `expert-pooling`, `market-routing`), average-case certificate through
a grid-based convex minorant of δ (sound by construction, conservative by one grid step: 1/400 of the regret range, or 11% at small gaps; an earlier version hulled the grid samples
themselves, which lies above δ between nodes and was violated by point-mass verifiers, fixed 2026-11-15), no strategic behaviour by the verifier beyond what the proper score already induces, and
the hinge comparison covers the binary case only (multiclass polyhedral surrogates need more dimensions; Frongillo–Waggoner).
