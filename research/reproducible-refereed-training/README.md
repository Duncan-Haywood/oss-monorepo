# Reproducible operators and refereed training: measured drift, tolerance, and what it hides

Stdlib-only Python (emulated float32). Grounds the drift assumptions of `../verification-game` and
`../property-elicitation-verification` in measurements. See `paper/whitepaper.md`.

```bash
cd research/reproducible-refereed-training
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 10 tests
PYTHONPATH=src python3 experiments/run.py                 # ~15 s, prints every number in the paper
```
Contents: float32 reductions under 5 orders (`fp32.py`), Merkle commitments (`merkle.py`), L2-logistic training
trace (`train.py`), teacher-forced one-step referee with tolerance τ (`referee.py`), drift statistics (`stats.py`).
Small-scale simulation; limitations in the paper. MIT.
