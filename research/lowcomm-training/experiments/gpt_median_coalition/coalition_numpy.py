"""Milestone 5j (prediction half): order-statistic shift of the median when k of M = 16 workers flip together.
Per coordinate, honest workers send mu + sigma z; the k attackers each send -10x their own delta. Shift = median(attacked) - median(all honest), mu/sigma = 0.4 (5h's measured late-training value). Pure numpy, 2,000,000 coordinates."""
import numpy as np
N, M, rng = 2_000_000, 16, np.random.default_rng(0)
print("snr  k  mean shift^2/sigma^2  bias/sigma   (ratio to k=1)")
for snr in (0.4,):
    base = None
    for k in (1, 2, 3, 4, 5, 6, 7, 8, 9):
        x = snr + rng.standard_normal((M, N)); y = x.copy(); y[:k] = -10 * x[:k]
        d = np.median(y, 0) - np.median(x, 0)
        s2 = (d**2).mean(); base = base or s2
        print(f"{snr:3.1f} {k:2d}  {s2:.4f}   {d.mean():+.3f}   x{s2/base:.1f}")
