# Paying verifiers for resolution, not calibration

Duncan Haywood. Code: `src/score_recalibration/model.py`. Stylised model; not a claim about any deployed protocol.

## Motivation
Verification protocols for decentralised ML (refereed training, inference audits) pay verifiers by a proper scoring rule on probability reports. Proper rules reward truthful reports, but real verifiers are miscalibrated, and the principal holds labelled history and can recalibrate for free. Following the calibration–refinement decomposition of proper scores (DeGroot–Fienberg; Bröcker) and the elicitation view of scores as Bregman divergences (Savage; Frongillo–Waggoner lines of work), we ask: how much of a raw score is calibration error, and how much does it distort selection and pay?

## Model
θ∈{0,1} with prior π; signal `s ~ N((2θ−1)μ, 1)`; true posterior logit `L = logit π + 2μs`, `p = expit(L)`. A verifier reports `r = expit(aL+b)` (slope a: a<1 under-, a>1 over-confident; b: shift). `r` is a function of `s`, hence `E[θ|s]=p`.

## Results
1. **Exact overpayment.** `E[(r−θ)²] = E[(p−θ)²] + E[(r−p)²]` and `E[−ln r_θ] = E[−ln p_θ] + E[KL(p‖r)]`. Verified by quadrature to 1e-10 (E1). At π=.5, μ=1: a=0.5 costs 0.0129 Brier (11% of the calibrated 0.1124); a=4 costs 0.360 nats of log loss against a calibrated 0.35.
2. **Local law.** For small distortion the excess is `E[(p(1−p))²((a−1)L+b)²]` (ratio 0.94 at ε=0.05, →1; E2). It is quadratic in miscalibration and weighted toward mid-range probabilities, so it hides in the tails that log score punishes.
3. **Brier is bounded, log is not.** At μ=1, even a hard 0/1 report (a→∞) beats the constant-prior Brier 0.25; under log score the same verifier does worse than the prior once a>3.85 (μ=.5: 2.43; E3).
4. **Ranking reversal.** Verifier A (μ=1, calibrated log loss 0.356) versus calibrated B (μ=0.7, 0.495). Raw log score ranks A first only for a∈(0.264, 2.49); at a=4 A scores 0.716 and B wins. Under Brier only extreme under-confidence (a<0.234) reverses. Recalibrated scores always rank A first (E4). Practical reading: log-score payments select for calibration, Brier for resolution.
5. **Cost of recalibrating.** Fitting (a,b) by logistic regression on n outcomes adds excess Brier `≈ tr(H I⁻¹)/(2n)`, with `H = 2E[(pq)² xxᵀ]`, `I = E[pq xxᵀ]`, `x=(L,1)`, `q=1−p` (delta-method). Simulation: within 1.0–1.3× at n=50, within 10% for n≥100 (E5). At π=.5, μ=1 the constant is 0.264, so fitting beats paying raw when n exceeds 20 (a=.5), 32 (a=2), ~80 (a=.7 or 1.5) (E6).

## Limits
(1) Distortion is a two-parameter logit family known to the principal; real miscalibration is non-parametric (isotonic fits cost more samples). (2) Strategic reporting is not modelled: paying on recalibrated scores makes only the ranking of reports matter, so shading is free but effort (resolution) is still paid; a fitted-on-own-history map opens manipulation of the fit, left open. (3) Gaussian signals, one binary event, i.i.d. jobs. (4) The finite-sample law is asymptotic. Contributions: exact overpayment identities, the Brier/log boundedness asymmetry and resulting selection reversals, and the delta-method sample cost with its break-even.

## Reproduce
`PYTHONPATH=src python3 -m unittest discover -s tests -v` (12 tests) and `PYTHONPATH=src python3 experiments/run.py` (seeded; ~25 s).
