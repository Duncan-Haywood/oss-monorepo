"""Experiments for ransac-twin. Output is experiments/results.txt (seeded; stdlib only)."""
import random
from ransac_twin.model import (comb_ratio, budget, real_pmf, failure, twin_failure, real_budget,
                               sample_scene, sampled_failure, ransac_line)

N, S, P, M = 100, 2, 0.99, 0.5
q0 = comb_ratio(round(M * N), N, S)
K0 = budget(q0, P)
print(f"N={N} s={S} target success p={P} mean inlier fraction m={M}")
print(f"twin (every scene has {round(M*N)} inliers): q={q0:.4f}, K_twin={K0}, twin failure={twin_failure(K0,N,S,M):.4f}")

print("\n(1) exact failure at K_twin and budget needed, real scenes ~ BetaBinomial(N, m, kappa)")
print("kappa   sd(frac)  fail@K_twin  K_real(p=.99)  K_real/K_twin  P(n_in<s)")
for kappa in (1e7, 50, 10, 4, 2, 1):
    pmf = real_pmf(N, M, kappa)
    sd = (sum(w * (k / N) ** 2 for k, w in enumerate(pmf)) - M ** 2) ** 0.5
    kr = real_budget(N, S, pmf, P)
    print(f"{kappa:<7g} {sd:.3f}     {failure(K0,N,S,pmf):.4f}       {kr if kr else 'none':<13}  {(f'{kr/K0:5.1f}' if kr else '  n/a')}        {sum(pmf[:S]):.4f}")

print("\n(2) Monte-Carlo check of the exact failure at K_twin (3000 scenes per row)")
rng = random.Random(7)
for kappa in (50, 4, 1):
    pmf = real_pmf(N, M, kappa)
    mc = sum(sampled_failure(K0, N, S, sample_scene(N, pmf, rng), rng) for _ in range(3000)) / 3000
    print(f"kappa={kappa:<4g} exact {failure(K0,N,S,pmf):.4f}  MC {mc:.4f}")

print("\n(3) end-to-end line fit (y=0.5x+1, noise sd 0.05, thr 0.15, uniform outliers in [0,10]x[-10,10]);")
print("    a scene 'fails' if |slope error|>0.1 ; 1000 scenes per row, scene inlier count from the pmf")
rng = random.Random(11)
def scene(n_in):
    pts = []
    for i in range(N):
        x = rng.uniform(0, 10)
        pts.append((x, 0.5 * x + 1 + rng.gauss(0, 0.05)) if i < n_in else (x, rng.uniform(-10, 10)))
    rng.shuffle(pts)
    return pts
for label, kappa, K in (("twin K, iid-ish kappa=1e7", 1e7, K0), ("twin K, kappa=4", 4, K0),
                        ("real K, kappa=4", 4, real_budget(N, S, real_pmf(N, M, 4), P))):
    pmf = real_pmf(N, M, kappa)
    bad = 0
    for _ in range(1000):
        a, b = ransac_line(scene(sample_scene(N, pmf, rng)), K, 0.15, rng) or (0.0, 0.0)
        bad += abs(a - 0.5) > 0.1
    print(f"{label:<28} K={K:<4} slope-failure rate {bad/1000:.3f}")
