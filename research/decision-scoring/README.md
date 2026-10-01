# Decision scoring

Stdlib-only Python. A verifier's report decides accept/reject and the outcome is observed only on acceptance, so naive scoring makes every verifier shade under the threshold. With a Brier-type reward and reserve `c0` on rejection, truthful reporting is achievable iff the score's entropy minimum `τ_s ≥ τ_d`, with a unique reserve `c0 = 1+τ_d²−2τ_dτ_s`; plain Brier only covers `τ_d ≤ ½`. Recentring the score by a linear term fixes every threshold at minimum rent `τ³/3` when `τ_s=τ_d`, while exploration (inverse-propensity) is proper but costs `≈1/ε` payment variance. See `paper/whitepaper.md`.

```bash
cd research/decision-scoring
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 10 tests, <1 s
PYTHONPATH=src python3 experiments/run.py                  # output in experiments/results.txt
```
Risk-neutral single verifier, deterministic threshold, uniform truth for loss/rent numbers; MIT.
