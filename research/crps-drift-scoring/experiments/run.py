"""Experiments E1-E5. Deterministic (seeded). Stdlib only."""
import math, random
from crps_drift_scoring import *

print("E1  scale misreport (d=0, sigma=1): excess CRPS vs excess log score, r = s/sigma")
print("r       crps      log       log/crps")
for r in (0.01, 0.05, 0.1, 0.25, 0.5, 0.8, 1.25, 2, 4, 10, 100):
    c, l = excess_crps(0, r, 0, 1), excess_log(0, r, 0, 1)
    print(f"{r:<7} {c:8.4f}  {l:9.3f}  {l / c:8.2f}")
print("overconfidence ceiling for CRPS =", round(crps_scale_floor(1), 4), "(log score unbounded)")

print("\nE2  mean error d/sigma at s=sigma=1: linear (CRPS) vs quadratic (log)")
print("d      crps      log")
for d in (0.1, 0.5, 1, 2, 4, 8, 16):
    print(f"{d:<6} {excess_crps(d, 1, 0, 1):8.4f}  {excess_log(d, 1, 0, 1):8.3f}")

print("\nE3  plug-in Gaussian fit from n samples (MLE): n x excess, 4000 seeds; theory CRPS 5/(8 sqrt(pi)) =",
      round(5 / (8 * math.sqrt(math.pi)), 4), ", log 1")
print("n     n*crps   n*log")
for n in (5, 10, 20, 50, 100, 200):
    rng = random.Random(n)
    c = l = 0.0
    R = 4000
    for _ in range(R):
        xs = [rng.gauss(0, 1) for _ in range(n)]
        m = sum(xs) / n
        s = math.sqrt(sum((x - m) ** 2 for x in xs) / n)
        c += excess_crps(m, s, 0, 1)
        l += excess_log(m, s, 0, 1)
    print(f"{n:<5} {n * c / R:7.4f}  {n * l / R:7.4f}")


def t_sample(rng, nu):
    return rng.gauss(0, 1) / math.sqrt(rng.gammavariate(nu / 2, 2) / nu)


print("\nE4  heavy-tailed truth (Student t, report N(0,1) against a t-distributed truth):")
print("sample std of the per-round loss over N rounds (median of 7 seeds). Finite variance needs nu>2 (CRPS) or nu>4 (log).")
print("nu   score  N=1e3   1e4     1e5")
for nu in (6.0, 3.0, 2.5):
    for name, f in (("crps", lambda y: crps_gauss(0, 1, y)), ("log ", lambda y: log_score(0, 1, y))):
        row = []
        for N in (10 ** 3, 10 ** 4, 10 ** 5):
            sds = []
            for seed in range(7):
                rng = random.Random(1000 * seed + N)
                v = [f(t_sample(rng, nu)) for _ in range(N)]
                mu = sum(v) / N
                sds.append(math.sqrt(sum((x - mu) ** 2 for x in v) / N))
            sds.sort()
            row.append(sds[3])
        print(f"{nu:<4} {name}  " + "  ".join(f"{x:6.2f}" for x in row))

print("\nE5  outcome-measurement noise: overconfident report m=0, s=0.2 (sigma=1), realised y=3, perturb y by eps=1e-3")
m, s, y, eps = 0.0, 0.2, 3.0, 1e-3
print("crps change =", f"{crps_gauss(m, s, y + eps) - crps_gauss(m, s, y):.2e}", " (bound eps =", eps, ")")
print("log  change =", f"{log_score(m, s, y + eps) - log_score(m, s, y):.2e}", " (slope (y-m)/s^2 =", round(log_slope(m, s, y), 1), ")")
