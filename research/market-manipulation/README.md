# Manipulating a verification market

Stdlib-only Python. An LMSR market prices "is this training result valid?"; an uninformed manipulator pushes the price to get a bad result accepted, and costly informed traders decide whether to enter. See `paper/whitepaper.md`.

```bash
cd research/market-manipulation
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 9 tests
PYTHONPATH=src python3 experiments/run.py                  # seconds; output in experiments/results.txt
```
Results: an uninformed manipulator's expected loss is exactly `b·KL(q‖τ)` and equals, to the digit, the extra rent it hands to informed traders; the induced entry raises accuracy by `μ[e₁(1−q) − e₀q − (1−2q)]`, which is positive only in a liquidity band (0.107, 0.413 in the baseline): below it nobody enters and manipulation costs `1−2q` accuracy, above `b = Nc/(H(q)−ln(1/(1−ε)))` entry is certain and manipulation is neutral. Formulas match an executable LMSR Monte Carlo (accuracy within 0.002, entrant profit 0). Stylised; MIT.
