"""Seeded experiments; output in results.txt."""
import math, random
from statistics import NormalDist
from variance_elicitation import *

rng = random.Random(7)
DISTS = {  # name: (sampler with unit variance, kurtosis)
    "uniform": (lambda: (rng.random() - 0.5) * math.sqrt(12), 1.8),
    "gaussian": (lambda: rng.gauss(0, 1), 3.0),
    "laplace": (lambda: rng.choice((-1, 1)) * rng.expovariate(1) / math.sqrt(2), 6.0),
    "exponential": (lambda: rng.expovariate(1) - 1, 9.0),
}

print("E1  pair statistic D=(y1-y2)^2/2: mean 1 and Var(D)=(kappa+1)/2 (unit variance, 2e5 pairs)")
for name, (f, k) in DISTS.items():
    ds = [pair_stat(f(), f()) for _ in range(200000)]
    m = sum(ds) / len(ds); v = sum((d - m) ** 2 for d in ds) / len(ds)
    print(f"  {name:11s} kappa={k:3.1f}  mean {m:.3f}  Var(D) {v:6.3f}  formula {var_pair(k):6.3f}")

print("\nE2  non-elicitable from one observation: N(0,1) and N(2,1) both have variance 1; their 50/50 mixture has variance",
      mixture_variance(1, 0, 1, 2), "(level set not convex)")
print("    with a known-mean score (y-mu0)^2 the report converges to sigma^2 + (mean gap)^2: mean gap 0.5 adds", known_mean_bias(1.0, 0.5))

print("\nE3  excess loss of reporting lam*sigma^2 (unit sigma^2, 2e5 Gaussian pairs)")
ds = [pair_stat(rng.gauss(0, 1), rng.gauss(0, 1)) for _ in range(200000)]
for lam in (0.5, 0.8, 1.25, 2.0):
    b = sum(brier_score(lam, d) - brier_score(1.0, d) for d in ds) / len(ds)
    i = sum(is_score(lam, d) - is_score(1.0, d) for d in ds) / len(ds)
    print(f"  lam={lam:4.2f}  Brier {b:.4f} (exact {excess_brier(lam, 1.0):.4f})   scale-free {i:.4f} (exact {excess_is(lam):.4f})")

print("\nE4  tasks needed so honest beats a lam-misreport with prob 95% (scale-free loss): CLT count vs simulated win rate at that count")
for name in ("gaussian", "laplace"):
    f, k = DISTS[name]
    for lam in (1.5, 1.25, 1.1, 0.8):
        m = math.ceil(tasks_needed(lam, k)); trials = 400 if m < 1500 else 150
        wins = 0
        for _ in range(trials):
            tot = 0.0
            for _ in range(m):
                d = pair_stat(f(), f())
                tot += is_score(lam, d) - is_score(1.0, d)
            wins += tot > 0
        print(f"  {name:8s} lam={lam:4.2f}  m={m:6d} (first-order {tasks_needed_first_order(lam, k):8.0f})  simulated win {wins / trials:.3f}")

print("\nE5  n=10 observations per task: variance of average of 5 disjoint pair stats vs unbiased sample variance (Gaussian, 1e5 tasks)")
n = 10; pa, sv = [], []
for _ in range(100000):
    ys = [rng.gauss(0, 1) for _ in range(n)]
    pa.append(sum(pair_stat(ys[2 * i], ys[2 * i + 1]) for i in range(n // 2)) / (n // 2)); sv.append(sample_variance(ys))
def var(x): m = sum(x) / len(x); return sum((a - m) ** 2 for a in x) / len(x)
print(f"  pairs {var(pa):.4f} (formula {pair_average_variance(n, 3.0):.4f})   sample variance {var(sv):.4f} (formula {var_sample_variance(n, 3.0):.4f})   ratio {var(pa) / var(sv):.3f} (formula {pairs_efficiency(n, 3.0):.3f})")

print("\nE6  heavy tails: median relative error of the mean of m pair stats, Pareto(alpha) observations; theory: error ~ m^-(1-2/alpha) for alpha<4")
def pareto_D(alpha):
    return pair_stat(rng.paretovariate(alpha), rng.paretovariate(alpha))
for alpha in (6.0, 3.0, 2.2):
    s2 = alpha / ((alpha - 1) ** 2 * (alpha - 2)); row = []
    for m, reps in ((100, 400), (1000, 100), (10000, 40), (100000, 12)):
        errs = sorted(abs(sum(pareto_D(alpha) for _ in range(m)) / m / s2 - 1) for _ in range(reps))
        row.append(f"m={m}: {errs[len(errs) // 2]:.3f}")
    print(f"  alpha={alpha}: " + "   ".join(row))
