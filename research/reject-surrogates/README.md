# Learning to escalate: polyhedral surrogates for accept/reject/escalate verifiers

Stdlib-only Python. Reject-option case of the polyhedral-embedding view of surrogate losses (Frongillo–Waggoner), applied to a verifier that may escalate to refereed re-execution. See `paper/whitepaper.md`.

```bash
cd research/reject-surrogates
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 6 tests
PYTHONPATH=src python3 experiments/run.py                  # ~30 s; output in experiments/results.txt
```
Results: the generalised-hinge conditional risk is minimised exactly at the kink encoding the Bayes action (0 mismatches); regret transfers linearly with constant exactly `2d`
(grid-verified); logistic transfer ratio blows up as `2d(1-d)/δ`; but in scalar SGD the logistic learner still beats the polyhedral one (negative result reported). Stylised; MIT.
