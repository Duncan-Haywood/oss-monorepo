# Tail-risk elicitation for drift tolerances

Stdlib-only Python. A verifier can be asked for the quantile (VaR) of benign floating-point drift, but slashing and compensation need the expected overshoot, i.e. expected shortfall (ES), which is not elicitable alone. The scale-free score `S(v,e;x) = ln e + (v + (x−v)₊/(1−α))/e − 1` elicits (VaR, ES) jointly, with a closed-form excess-score law. See `paper/whitepaper.md`.

```bash
cd research/tail-risk-elicitation
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 10 tests, ~6 s
PYTHONPATH=src python3 experiments/run.py                  # ~2 s; output in experiments/results.txt
```
Results: ES alone fails Osband's convexity test (mixture moves ES 1.6→2.24); misreporting ES by factor r costs exactly `ln r + 1/r − 1` (understating by half costs 0.307, overstating by two 0.193), matched to 4–5 decimals by quadrature; a VaR-only tolerance leaves mean overshoot `v/(a−1)` uncovered (ES = 6× VaR at Pareto index 1.2); auditing an ES report needs ~2,000 samples to catch a 20% understatement at index 4 and the CLT plan fails for index ≤ 2. Stylised distributions; MIT.
