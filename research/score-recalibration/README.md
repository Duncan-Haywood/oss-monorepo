# Paying verifiers for resolution, not calibration

Stdlib-only Python. A verifier whose probability reports are a monotone distortion `r = expit(aL+b)` of the true posterior is scored on the raw proper score and pays for its miscalibration; a principal can undo the distortion from labelled history. This quantifies the overpayment, when raw scores mis-rank verifiers, and what recalibrating costs in samples. See `paper/whitepaper.md`.

```bash
cd research/score-recalibration
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 12 tests, ~1 s
PYTHONPATH=src python3 experiments/run.py                  # ~25 s; output in experiments/results.txt
```
Results: raw Brier excess is exactly `E[(r-p)^2]` and raw log excess exactly `E[KL(p‖r)]`; Brier is bounded (a hard 0/1 report still beats the prior at μ=1) while log is not; under log score a higher-resolution verifier loses to a weaker calibrated one for slope `a ≥ 2.49` or `a ≤ 0.264` (Brier: only `a ≤ 0.234`); an n-sample logistic recalibration costs `(1/2n)·tr(H I⁻¹)` excess Brier (0.264/n at π=0.5, μ=1; simulation within ~10%). Gaussian-signal model, stylised; MIT.
