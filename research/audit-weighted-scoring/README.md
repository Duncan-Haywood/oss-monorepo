# Audit-weighted scoring

Stdlib-only Python. When ground truth arrives only on audited tasks and the audit rate depends on the report (e.g. confident claims are audited more), naive "score when audited" is no longer proper: under `g(r)=a+br` the verifier shades by `≈ −b p(1−p)/(2(a+bp))` and, for steep `b`, hides entirely (reports 0). Inverse-propensity weighting (`B/g(r)` when audited) is exactly proper for any `g>0`; its variance is `E[B²]/g − L²`, and a Neyman (water-filling) audit allocation minimises it, with an honest finding: the gain over uniform audits is small (3% for uniform priors, 11% for U-shaped). See `paper/whitepaper.md`.

```bash
cd research/audit-weighted-scoring
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 9 tests, <1 s
PYTHONPATH=src python3 experiments/run.py                  # seconds; output in experiments/results.txt
```
Binary, Brier loss, audit coin independent of the outcome (selection on the outcome is not identified); MIT.
