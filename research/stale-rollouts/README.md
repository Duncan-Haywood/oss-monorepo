# Stale rollouts: what an off-policy sample is worth after the policy moves

Stdlib-only Python. In asynchronous swarm RL a peer's rollout was drawn from an older policy. For Gaussian policies with mean shift `δ` (in standard deviations) the importance weight has exact moments `E w = 1`, `E w² = e^{δ²}`, so the effective sample fraction is `e^{−δ²}` (E1: 0.368 at `δ=1`), and a learner needing `ESS/n ≥ ρ` may accept a lag of `⌊√ln(1/ρ)/drift⌋` policy versions. Truncating weights at `c` has closed-form mass lost, bias and variance (checked against 10⁶ draws); for a shift-estimation task the best cap cuts MSE 1.9× at `δ=1`, 12.8× at `δ=2`, ~750× at `δ=3`. See `paper/whitepaper.md`.

```bash
cd research/stale-rollouts
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 7 tests, ~1 s
PYTHONPATH=src python3 experiments/run.py                  # seconds; output in experiments/results.txt
```
Equal-variance Gaussian policies, a mean-shift statistic, deterministic per-version drift; MIT.
