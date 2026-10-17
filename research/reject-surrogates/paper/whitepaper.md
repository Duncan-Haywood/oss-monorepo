# Learning to escalate: polyhedral surrogates for accept/reject/escalate verifiers

*Working note, MIT licensed. Stylised; numerical experiments in pure Python, no claims about any deployed protocol.*

## Motivation
A verifier in a decentralised training network has three options on a claimed piece of work: accept, reject, or *escalate* to refereed
re-execution (see `verification-game`). Escalation costs d (in units of the cost of a wrong verdict, d < 1/2), so the Bayes rule is a
three-way threshold on η = P(work correct | x): reject if η ≤ d, accept if η ≥ 1−d, escalate otherwise. Training such a verifier by
minimising 0-1-d loss directly is intractable; the question is which convex surrogate to minimise, and what surrogate suboptimality
buys in decision quality. This is the reject-option case of the *embedding* view of surrogate losses of Frongillo and Waggoner
(a polyhedral surrogate embeds the discrete reports as points of R^d; its minimisers are exactly those points and regret transfers linearly).

## Setup (`src/reject_surrogates/model.py`)
Score u ∈ R, decoded with cutoffs ±1/2 (u > ½ accept, u < −½ reject, else escalate). Polyhedral (Bartlett–Wegkamp) surrogate with a = (1−d)/d:
φ(z) = 1 − a·z (z<0), 1 − z (0≤z<1), 0 (z≥1). Comparison: logistic loss decoded on σ(u) with the Bayes thresholds.

## Results (`experiments/results.txt`)
**R1 (embedding).** The conditional polyhedral risk is piecewise linear with kinks at −1, 0, 1 and values η/d, 1, (1−η)/d there, so its minimiser is
exactly the kink whose action is Bayes-optimal: 0 mismatches over 999 values of η at d = 0.2 (E1).

**R2 (linear regret transfer, constant 2d).** For every η and u, regret_{0-1-d}(decode(u)) ≤ **2d** · regret_φ(u). A grid search over
η, u gives sup ratio 0.1000, 0.2000, 0.5000, 0.8000, 0.9800 at d = 0.05, 0.1, 0.25, 0.4, 0.49 — exactly 2d (E2), attained at u = −½ for any η < d:
there R(−½) is the midpoint of R(−1) and R(0), so surrogate regret is (d−η)/(2d) while decision regret is d − η. At d = ½ this recovers the
hinge constant 1; cheap escalation makes the surrogate *more* conservative than the decision loss. (Verified on the grid and by 5000 random
draws in the tests; the tight case is derived above; I have not written a full proof for all u.)

**R3 (logistic has no linear transfer).** With u just on the wrong side of the reject cutoff and η = d+δ, decision regret is Θ(δ) while logistic
regret is ≈ δ²/(2η(1−η)), so the ratio is ≈ 2d(1−d)/δ: measured ratio·δ = 0.404, 0.385, 0.378, 0.376, 0.375 for δ = 0.1 … 0.001 at d = 0.25 (E3). The transfer
is only square-root: regret_{0-1-d} ≲ sqrt(regret_φ).

**R4 (negative result: the better transfer does not make SGD better).** Scalar SGD on a single cell with η = d+δ (E4, 2000 seeds): the
polyhedral iterate keeps jittering around a kink (step ∝ 1/√t, minimiser at a non-differentiable point) and its decoded regret is far above the
logistic one at every horizon: at δ = 0.03, T = 1000 regret 0.0073 vs 0.0001; even at δ = 0.1, T = 100 it is 0.029 vs 0.0000. The logistic
learner converges to the logit of η at rate 1/T and then decodes on a calibrated probability, so the sqrt transfer is irrelevant in this well-specified,
one-parameter-per-cell problem. The polyhedral surrogate's advantage is therefore *not* sample or optimisation efficiency here; it is that the report space is
exactly embedded (finite decisions, no calibration step, a bounded 3-valued minimiser) and that the transfer constant is a clean, distribution-free 2d.

## Implications
1. A verifier's escalate band (d, 1−d) narrows linearly in the escalation cost ratio; the polyhedral surrogate gives a distribution-free guarantee that loss regret ≤ 2d × surrogate regret.
2. Do not read that guarantee as a reason to prefer hinge-type surrogates in practice: in the well-specified case logistic-plus-thresholds was much better. The polyhedral form matters when the model is misspecified or when outputs must be discrete and bounded (e.g. on-chain).
3. The 1-D embedding here is the smallest case of the general result that dimension needed ≈ number of actions − 1 for arbitrary finite reports.

## Limits
Symmetric error costs only (asymmetric costs need d ≤ min cost/2 and clamping; not done). One-dimensional scalar SGD, not a deep model;
misspecified regimes, the 2d constant's proof for all u, multi-class abstention (Ramaswamy et al.) and lower bounds are open in this repo.
