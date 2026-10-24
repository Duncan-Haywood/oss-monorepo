# Research log: sim2real-inference

Newest first. Write the hypothesis and the planned analysis before running an experiment, then the outcome.

## 2026-10-24 · Milestone 2 part 1: consolidated estimator library
- Hypothesis written before running: the three projects' closed forms are special cases of one family `mean(R) - lam (mean(T_paired) - mean(T_all))`, so one library with `lam` in {0, 1, power-tuned, OLS} should reproduce their numbers, and PPI (`lam` = 1) should lose to real-only when the twin's sensitivity differs from reality's (twin scale `g` = 2).
- Result: `src/sim2real_inference/` (stdlib only) and 11 tests pass. All four estimators are unbiased against a twin bias of 0.7; the exact fixed-`lam` variance `var_ppi` equals `var_cv` at the optimal `lam`, and matches simulation within 7%; the 95% intervals of PPI, PPI++ and CV cover above 92% at n = 30, N = 300. With `g` = 2, PPI's variance exceeds real-only's while CV's is below it, which is the first concrete case for tuning `lam` (H1 groundwork, not yet a result on benchmark pairs).
- Caught on the way: a test I wrote used the noise-free correlation for a noisy twin and failed at variance ratio 1.50; the code was right, the test was wrong.
- Not done: the synthesis table of what the ~130 `*-twin` projects say about `rho`, and `twin-pilot`'s two-stage procedure is not ported. Next: the synthesis, then milestone 3 (MuJoCo pairs).

## 2026-10-24 · Programme opened
- Wrote `PROPOSAL.md`: 13 references checked against arXiv and Crossref, six falsifiable hypotheses, seven milestones, target CoRL.
- Prior work in this repository: about 130 `*-twin`, `twin-*` and `mimic-twin*` projects, each a stylised model of one way a twin misleads. `twin-evaluation` and `twin-pilot` already cite prediction-powered inference and SIMPLER, so the novelty claimed here is narrower: unification under context pairing, the certification boundary, active and anytime-valid evaluation, and real paired data.
- Next: milestone 2. Build one estimator library that reproduces the analytic results of `twin-evaluation`, `twin-pilot` and `twin-certification` as tests, and write a synthesis table of what the twin projects found about the paired correlation ρ.
