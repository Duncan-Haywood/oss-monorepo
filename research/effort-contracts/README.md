# Effort contracts: scoring rules as limited-liability payments for costly inference

Stdlib-only Python. A worker privately chooses effort that sharpens her signal, reports a probability, and is paid a scaled proper score relative to the prior report. See `paper/whitepaper.md`.

```bash
cd research/effort-contracts
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 6 tests
PYTHONPATH=src python3 experiments/run.py                  # seconds; output in experiments/results.txt
```
Results: shirking threshold `α0 = 2c/(kκ²)` (Brier k=1, log k=2; matched to <1%); scale `α = w` with a fee is first best; under limited liability
the optimal scale is below `w` and the principal keeps only 48–68% of first-best surplus; log score is cheaper than Brier to induce high effort. Stylised; MIT.
