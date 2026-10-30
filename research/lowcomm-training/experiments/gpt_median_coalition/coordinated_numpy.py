"""Milestone 5l (prediction half): the worst-case coordinated attack on the coordinate-wise median at M = 16.
Per coordinate honest workers send mu + sigma z (z standard normal). Independent flips (5j) send -10x of each
member's own delta, so a member whose x is negative pushes the wrong way. The coordinated attack sends every
attacker to -infinity (opposite to the signal), the strongest push a median allows. Net signal = mu + bias
(sigma units); the account of 5k says training breaks when it reaches zero. Pure numpy, 1,000,000 coordinates."""
import numpy as np
N, M, rng = 1_000_000, 16, np.random.default_rng(0)
print("snr   k  indep_bias  coord_bias  net_indep  net_coord")
for snr in (0.3, 0.4, 0.6, 1.0):
    x = snr + rng.standard_normal((M, N)); h = np.median(x, 0)
    for k in range(1, 9):
        y = x.copy(); y[:k] = -10 * x[:k]
        bi = (np.median(y, 0) - h).mean()
        z = np.sort(x[k:], 0)  # attackers at -inf occupy the k lowest ranks of the M sorted values
        full = np.concatenate([np.full((k, N), -np.inf), z], 0)
        bc = ((full[M // 2 - 1] + full[M // 2]) / 2 - h)
        bc = np.where(np.isfinite(bc), bc, np.nan)
        # median of 16 = mean of ranks 8,9 (1-indexed); with k >= 8 the lower middle is -inf: breaks down
        print(f"{snr:3.1f} {k:3d} {bi:+9.3f} {np.nanmean(bc) if k < 8 else float('-inf'):+10.3f} "
              f"{snr + bi:+9.3f} {snr + (np.nanmean(bc) if k < 8 else float('-inf')):+9.3f}")
