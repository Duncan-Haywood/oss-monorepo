# From scoring-rule loss to decision regret: certificates for accept / audit / slash

Stdlib-only Python. Exact calibration functions (worst-case decision regret for a given excess proper score) for a three-action verification decision. See `paper/whitepaper.md`.

**Live page:** https://marisstella.app/research/decision-regret-transfer/

```bash
cd research/decision-regret-transfer
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 8 tests (one expected failure)
PYTHONPATH=src python3 experiments/run.py                  # ~1 min; output in experiments/results.txt
```
Results: Brier transfers as ε², log as KL(τ+ε‖τ) (closed forms match to 9 digits, exact δ matches brute force); at a 0.01-nat gap the log certificate falls from 0.071 (A/R=1) to 0.013 (A/R=200);
weighted hinge transfers linearly but is not strictly proper; an audit action tightens the certificate; the average-case certificate `E[regret] ≤ ψ⁻¹(E[score])` is never violated in simulation
(realised regret 8–26% of it) and is attained by a two-point verifier. Stylised; MIT.

## Known defect (quality census 2026-11-15)

The average-case certificate `ψ⁻¹(E[score])` is **not a valid bound** as built. `envelope()` (`src/decision_regret_transfer/model.py:112`) takes the convex hull of δ sampled on a grid, and δ is a step function, so between grid points the hull lies above δ and the Jensen step fails. A verifier sitting on one tight pair beats it: with `Costs(1, 1, c=0.2)` and Brier, `regret_bound(envelope(C, "brier"), delta(C, "brier", 0.001))` is 0.0004 against a realised regret of 0.001. The "never violated in simulation" result above holds only for the random verifiers simulated. A fix (build the hull from the lower step corners, re-run, restate the numbers) is open; see the [audit](../../portfolio/quality/audits/2026-11-15-decision-regret-transfer.json).
