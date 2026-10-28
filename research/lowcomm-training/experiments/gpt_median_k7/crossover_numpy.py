"""Milestone 5k (prediction half): the k at which the median's bias overtakes the honest signal, by mu/sigma.
M = 16, k attackers send -10x their own delta, 1,000,000 coordinates, seed 0. net = mu/sigma - |bias|/sigma (>0: the step still points the right way)."""
import numpy as np
N, M, rng = 1_000_000, 16, np.random.default_rng(0)
print("snr   " + " ".join(f"k={k:<2d}" for k in range(1, 10)) + "   (net signal / sigma)")
for snr in (0.3, 0.4, 0.5, 0.6, 0.8, 1.0):
    row = []
    for k in range(1, 10):
        x = snr + rng.standard_normal((M, N)); y = x.copy(); y[:k] = -10 * x[:k]
        row.append(snr + (np.median(y, 0) - np.median(x, 0)).mean())
    print(f"{snr:3.1f}  " + " ".join(f"{v:+.2f}" for v in row))
