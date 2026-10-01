# Holdout markets: paying for model improvements without paying for overfitting

*Working note, MIT licensed. Stylised model (logistic regression, synthetic data, small scale). The mechanisms are
adaptations of known ideas — improvement-based payments as in collaborative prediction markets (Abernethy & Frongillo
2011) and the Ladder leaderboard (Blum & Hardt 2015), related to the reusable holdout (Dwork et al. 2015). The
contribution is the measurement of how badly the naive payment rule fails and what the fix costs. No claims about any
deployed protocol.*

## Motivation
In a decentralised training network, contributors submit model updates and must be paid for value added. The natural
rule pays the decrease in loss on a hidden holdout, a proper scoring rule. Each payment is also a *query answer* about the
holdout. Contributors can adapt to those answers, so the holdout is eventually fit rather than generalised to.

## Mechanism
State: published model θ with published holdout loss ℓ (log loss, clipped to [0, ln(1/ε)]).
* **raw**: accept a submission θ' iff L_H(θ') < ℓ; pay B(ℓ − L_H(θ')).
* **ladder(η)**: accept iff L_H(θ') < ℓ − η; publish ℓ' = round(L_H(θ'), η); pay B(ℓ − ℓ').

## Results
**1. Budget telescopes (proved, tested).** Payments sum to B(ℓ₀ − ℓ_T) ≤ Bℓ₀ for any number of submissions, so the
sponsor's worst-case outlay is known in advance. Submitting the current model pays 0 (copy-proof).

**2. Splitting.** Under raw, splitting an improvement into steps never lowers the total (final published loss ≤ the loss of
the last submission). Under the ladder, the gate is against the published loss, so splitting changes the total by at most
one rung (B·η, tested). The real cost is that improvements below η are unpaid and are not published.

**3. Naive payments reward overfitting; the published model gets worse.** After an honest phase (d=20, holdout n=100, 8
seeds), an adversary with no data proposes random perturbations around the published model and keeps whatever is paid.
Raw mechanism, 5000 queries: paid 0.148 while the population log loss of the published model *rose* by 0.371
(overpayment 0.52 in loss units; `experiments/results.txt`). With the ladder at η=0.02 the same attack is paid 0.008 and
degrades the model by 0.002; at η=0.05 it is paid 0.

**4. The ladder's price.** Honest contributors with small shards (10 samples, 30 contributors) improve the true loss by
0.336 under raw but 0.293 (η=0.02) and 0.227 (η=0.05) under the ladder: sub-η improvements are neither paid nor
published, so the model is slower to improve. For n=100 holdout points, η≈0.02–0.05 is the workable window here; at
η=0.1 even the first phase loses ~25% of the paid gain.

## Implications
* The holdout must be treated as a consumable. Any protocol that publishes exact per-submission scores for verifiable
  training contributions leaks the holdout at a rate the attacker controls.
* Resolution η is a design parameter trading contribution granularity against holdout life; it should scale as ~n^(-1/3)
  under the Blum–Hardt analysis (I did not test scaling with n).
* The verification layers elsewhere in this repo (refereed re-execution) check that an update was computed honestly;
  they do not check that it *generalises*. A holdout market is orthogonal and needed in addition.

## Limitations
Synthetic logistic model, one attack (greedy random search — a stronger adversary using gradient-free or
label-inference attacks would do more damage to raw; the ladder bound is worst-case), one holdout size, 8 seeds, no
sybil/collusion analysis, positive-only payments (a signed rule would penalise random probing but needs stake).
Not tested: neural networks, fresh-holdout rotation, the reusable holdout (Thresholdout) as an alternative.

## References
Abernethy & Frongillo, *A collaborative mechanism for crowdsourcing prediction problems*, NeurIPS 2011.
Blum & Hardt, *The Ladder: a reliable leaderboard for machine learning competitions*, ICML 2015.
Dwork, Feldman, Hardt, Pitassi, Reingold, Roth, *The reusable holdout*, Science 2015.
