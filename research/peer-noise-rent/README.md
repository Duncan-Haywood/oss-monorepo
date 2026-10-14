# Peer noise rent

Stdlib-only Python. Multi-task peer prediction pays a verifier `2·Cov(x_i,x_j) = 2p(1−p)g_i g_j` in expectation, but the network only ever has n tasks. The plug-in payment (agreement minus the agreement implied by empirical frequencies) is exactly `2×` the sample covariance, with an exact variance `(μ₂₂−c²)/n + (σ_x²σ_y²+c²)/(n(n−1))` (verified by full enumeration); it is `√2` less noisy than the fresh-penalty-task version at the null, pays a constant reporter exactly 0, and under limited liability a verifier who does no work still earns a positive "noise rent" `≈ σ/√(2π)`. A deductible sized by the normal formula kills the rent at a stated cost to honest pay; sample sizes for detection and ranking are closed form and hit 95% in simulation. See `paper/whitepaper.md`.

```bash
cd research/peer-noise-rent
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 9 tests, ~1 s
PYTHONPATH=src python3 experiments/run.py                  # under a minute; output in experiments/results.txt
```
Binary reports, conditionally independent given a binary state, i.i.d. tasks; MIT.
