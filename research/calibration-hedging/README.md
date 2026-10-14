# Calibration hedging

Stdlib-only Python. A slashing rule that only tests *calibration* ("among rounds where you said `p`, outcomes must occur with frequency ≈ `p`") can be passed with no information at all. A Foster–Vohra/Blackwell hedger that plays a 2-point minimax mixture over a grid keeps its expected calibration error below `√(K+1)(1/(2K)+1/√T)` against **any** outcome sequence, including one that sees its forecast distribution. Measured (K=10, T=2000): ECE 0.016 against an adaptive adversary while its Brier score is 0.254, versus 0 for a verifier who knows the rule; a constant-0.5 forecaster is slashed (ECE 0.5) and the hedger passes every test at ε ≥ 0.05. A Brier-gap test against an informed benchmark separates them in 100/100 runs at T=500. Calibration is necessary for honest verifiers but not evidence of information; slashing and pay must use a resolution-sensitive proper score. See `paper/whitepaper.md`.

```bash
cd research/calibration-hedging
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 6 tests, ~2 s
PYTHONPATH=src python3 experiments/run.py                  # output in experiments/results.txt
```
Binary outcomes, grid forecasts, adversary sees the mixture but not the draw; MIT.
