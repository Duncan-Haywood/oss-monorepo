# Peer noise rent

Stdlib-only Python. Multi-task peer prediction pays a verifier `2·Cov(x_i,x_j) = 2p(1−p)g_i g_j` in expectation, but the network only ever has n tasks. The plug-in payment (agreement minus the agreement implied by empirical frequencies) is exactly `2×` the sample covariance, with an exact variance `(2(n−1)/n)²·[(μ₂₂−c²)/n + (σ_x²σ_y²+c²)/(n(n−1))]` (verified by full enumeration); it is `√2` less noisy than the fresh-penalty-task version at the null when both report marginals are ½, pays a constant reporter exactly 0, and under limited liability a verifier who does no work still earns a positive "noise rent" `≈ σ/√(2π)`. A deductible sized by the normal formula kills the rent at a stated cost to honest pay; sample sizes for detection and ranking are closed form and reach 94–95% in simulation (normal approximation; exact power 93.8% at n=56). See `paper/whitepaper.md`.

**Live page:** https://marisstella.app/research/peer-noise-rent/

```bash
cd research/peer-noise-rent
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 9 tests, ~1 s
PYTHONPATH=src python3 experiments/run.py                  # under a minute; output in experiments/results.txt
```
Binary reports, conditionally independent given a binary state, i.i.d. tasks; MIT.

## Known gaps

From the [2026-11-17 quality audit](../../portfolio/quality/audits/2026-11-17-peer-noise-rent.json), not yet fixed:

- **`score_fresh` pairs neighbouring tasks** (`src/peer_noise_rent/model.py`): penalty term k uses task k's first report and task k+1's second, so adjacent terms share a task and covary by `(2f_i−1)(2f_j−1)Cov`. At marginals ½ (every place the tests and E1 check) that is zero; away from ½ the simulated scheme is noisier than `fresh_stats` says (2.16e-3 against 1.92e-3 at p=0.2, g=0.8, n=200). The fix (two independent penalty draws) changes the RNG stream and so every simulated figure; it needs a full rerun of `run.py` and the paper's numbers.
- **The fresh-penalty baseline is this project's own** (2n tasks), not Dasgupta–Ghosh as published, which takes penalty tasks from the same batch; the √2 saving is measured against it.
- **Related work is missing**: Dasgupta and Ghosh (2013), Shnayder et al. (2016), Kong's DMI, Agarwal et al., Witkowski et al. (2013). The variance of a sample covariance is textbook, and the rent is the folded-normal mean; the contribution is applying them, not deriving them.
- **No incentive analysis** of the floored or deductible payment.
