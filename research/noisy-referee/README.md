# Scoring verifiers against a noisy referee

Stdlib-only Python. Paying verifiers against a judge whose label flips with rates `e0, e1` distorts honest reports to `e0+γp` (`γ=1−e0−e1`), shrinks the Brier incentive by `γ²`, and can reverse rankings (η*=0.25 in our example). The unbiased surrogate score restores exact properness at a `1/γ` payment spread and (balanced case) `1/γ²` sample cost; misestimated rates give a closed-form affine bias. See `paper/whitepaper.md`.

```bash
cd research/noisy-referee
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 12 tests, <1 s
PYTHONPATH=src python3 experiments/run.py                  # seconds; output in experiments/results.txt
```
Results: reversal threshold 0.2500 (Brier) / 0.178 (log); n inflation 1.56, 2.78, 6.25, 25 at η=0.1…0.4 (= 1/γ²); rate-estimation excess ≈0.164/m within 6% of the delta method. Binary, stylised; MIT.
