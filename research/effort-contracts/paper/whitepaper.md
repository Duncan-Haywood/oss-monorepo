# Scoring rules as effort contracts: what a proper score buys under limited liability

*Working note, MIT licensed. Stylised; numerical experiments in pure Python, no claims about any deployed protocol.*

## Motivation
Verification and inference markets (see `decentralized-verification-markets`, `wagering-modular-experts`, `holdout-market`)
pay workers with proper scoring rules so that reports are truthful. Properness fixes the *report* but not the *effort*: the
worker still chooses privately how much compute or data to spend before reporting. This note treats the score as a
principal–agent contract (moral hazard on effort, no negative payments) and asks what scale and which score to use.

## Model (`src/effort_contracts/model.py`)
Effort e ≥ 0 costs c·e²/2 and sharpens a symmetric binary signal to accuracy q(e) = ½ + (κ/2)(1−e^{−e}), κ=0.9. The worker
reports her posterior and is paid α·[S(r,y) − S(½,y)], a proper score relative to the prior report, so her expected pay is α·I(q)
with I = (q−½)² (Brier) or the mutual information ln2 − H(q) (log). The principal's value is w·(q−½)², w=1.
The cost-of-effort incentive is thus α·I(q(e)) − c e²/2.

## Results (`experiments/results.txt`)
**R1 (shirking threshold).** Near zero effort I ≈ k(κe/2)² with k=1 (Brier), 2 (log), so effort is positive iff
**α > α0 = 2c/(kκ²)**. Measured by global search: within 1% at all tested c (E1). Log score halves the threshold (its
information curve is twice as steep at the prior), so its scale is not comparable to Brier's.

**R2 (first best needs a fee).** With α = w the worker internalises the full value and exerts the first-best effort (E3,
equal to three decimals); the principal recovers the surplus with a participation fee. Without one (limited liability,
pay ≥ 0 in expectation) that contract hands all surplus to the worker.

**R3 (limited liability underprovides effort).** Choosing α to maximise value minus pay gives α* < w (0.34–0.91 for
c=0.02–0.3), effort 63–70% of first best, and surplus only **48–65% (Brier)** of first-best (E2). The efficiency loss is largest (ratio falls toward 48%) as effort gets costlier, where the first-best effort is small.

**R4 (score shape matters at high effort).** To induce a target effort e the worker's rent is lower under log score than Brier
once accuracy is high (e=1.5, c=0.1: rent 0.120 vs 0.149, E4), because the log information curve is more convex there,
so the principal's optimum is 0–6% better with log (E2). At low effort the two coincide. This is one instance, under a Brier-valued
principal; it does not show log is generally superior.

## Implications
1. Set the scale from the shirking threshold, not from the loss units: a scale below 2c/(kκ²) buys pure noise, and
   the threshold depends on which score is used.
2. If protocols allow a bond or entry fee, use scale ≈ marginal value and recoup rent via the fee; if not, expect to
   underprovide effort by a third and pay the price in accuracy.
3. Calibrating a verification market's reward budget therefore needs an estimate of worker cost c; the same c drives the
   stake requirements in `spot-check-slashing` and `verification-game`.

## Limits
One-dimensional effort, a specific accuracy curve, risk-neutral workers, no competition between workers (which would
add relative-performance schemes), and no dynamic effort. Extending to multi-worker tournaments and to ambiguous
outcomes (peer prediction, where the outcome is not observed) is the natural next step, taken in `peer-prediction-effort`.
