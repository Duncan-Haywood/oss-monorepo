# Sandwich attacks on LMSR verification markets

Stdlib-only Python. A front-runner who buys before and sells after a victim's LMSR trade extracts exactly the victim's slippage tolerance times its fair cost, needs capital of only about `ε·b/(1−p)` shares, and is stopped by a proportional fee of about `v(1−p)/(2b)`; pro-rata batching does not help. See `paper/whitepaper.md`.

```bash
cd research/market-sandwich
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 13 tests, <1 s
PYTHONPATH=src python3 experiments/run.py                  # seconds; output in experiments/results.txt
```
Results: profit = `ε·C₀` to 1e-14 on 216 instances; break-even fee ratio to first order 0.975–1.000; closed-form optimal tolerance within 2% of numeric when `σ, v ≪ b`; pro-rata batching leaves 0.989–0.999 of the extraction; random ordering cuts it exactly 3×. Binary LMSR, stylised; MIT.
