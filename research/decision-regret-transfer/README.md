# From scoring-rule loss to decision regret: certificates for accept / audit / slash

Stdlib-only Python. Exact calibration functions (worst-case decision regret for a given excess proper score) for a three-action verification decision. See `paper/whitepaper.md`.

```bash
cd research/decision-regret-transfer
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 7 tests
PYTHONPATH=src python3 experiments/run.py                  # ~1 min; output in experiments/results.txt
```
Results: Brier transfers as ε², log as KL(τ+ε‖τ) (closed forms match to 9 digits, exact δ matches brute force); at a 0.01-nat gap the log certificate falls from 0.071 (A/R=1) to 0.013 (A/R=200);
weighted hinge transfers linearly but is not strictly proper; an audit action tightens the certificate; the average-case certificate `E[regret] ≤ ψ⁻¹(E[score])` is never violated in simulation
(realised regret 8–26% of it) and is attained by a two-point verifier. Stylised; MIT.
