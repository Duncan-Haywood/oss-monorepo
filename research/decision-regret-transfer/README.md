# From scoring-rule loss to decision regret: certificates for accept / audit / slash

Stdlib-only Python. Exact calibration functions (worst-case decision regret for a given excess proper score) for a three-action verification decision. See `paper/whitepaper.md`.

**Live page:** https://marisstella.app/research/decision-regret-transfer/

```bash
cd research/decision-regret-transfer
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 12 tests, ~12 s
PYTHONPATH=src python3 experiments/run.py                  # ~20 s; output in experiments/results.txt
python3 experiments/figure.py                              # redraws regret_bound.svg from results.txt
```
Results: Brier transfers as ε², log as KL(τ+ε‖τ) (closed forms match to 9 digits, exact δ matches brute force); at a 0.01-nat gap the log certificate falls from 0.072 (A/R=1) to 0.014 (A/R=200);
weighted hinge transfers linearly but is not strictly proper; an audit action tightens the certificate. The average-case certificate `E[regret] ≤ ψ⁻¹(E[score])` is a valid bound by construction
(ψ is the convex hull of the lower corners of a step function below δ) and is checked against point-mass verifiers on 12,252 tight pairs with no violation (E7);
it is conservative by at most one grid step (certificate/regret ≤ 1.11), and realised regret of five simulated verifiers is 8–26% of it (E5). Stylised; MIT.

The binary calibration function is not new: it is the proper-loss surrogate regret bound of Reid & Williamson (ICML 2009; JMLR 2011).
What this note adds is a computable version for the three-action accept/audit/reject decision with asymmetric costs and a sound average-case certificate; see the whitepaper's "Prior work and what is new".

## Fixed defect (quality census 2026-11-15)

Before this fix `envelope()` hulled δ sampled on a grid. δ is nondecreasing, and between grid nodes that hull lay above it, so the Jensen step failed and a point-mass verifier on a tight pair beat
the "certificate" (10,115 of the 12,396 pairs in the sweep, up to 2.5× at small gaps; with `Costs(1, 1, c=0.2)` and Brier, 0.0004 against a realised regret of 0.001). The test meant to guard this asserted
the wrong inequality. Now `envelope()` hulls the step's lower corners (x_k, δ(x_{k−1})) on a uniform grid plus a geometric ladder towards 0, and `test_certificate_covers_every_tight_pair` pins it.
Every E2 and E5 certificate rose by 1–2.5% (one grid step). See the [audit](../../portfolio/quality/audits/2026-11-15-decision-regret-transfer.json).
