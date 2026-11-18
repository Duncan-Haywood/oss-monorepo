# Categorical scores

Stdlib-only Python. Multiclass follow-up to `tangent-log`: exact regrets, worst-case regrets and local curvature of the Brier, spherical and log scores on the K-simplex. Worst-case regret is `1−2p_min+‖p‖²` (Brier) and `‖p‖−p_min` (spherical); per unit of payment range spherical beats Brier by exactly `√K` at a uniform truth, and both bounded scores nearly ignore a dropped rare class (regret about 1e-4 at ρ=0.01, where log's regret is 0.15 for a reported floor of 1e-9 and grows without bound as the floor goes to 0). These are known results applied to this setting; prior work is in section 5 of the paper. See `paper/whitepaper.md`.

**Live page:** https://marisstella.app/research/categorical-scores/

```bash
cd research/categorical-scores
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 6 tests, <1 s
PYTHONPATH=src python3 experiments/run.py                  # output in experiments/results.txt
```
Risk-neutral verifiers, one report per task; MIT.
