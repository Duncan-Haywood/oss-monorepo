"""Exact coverage of 95% one-sided upper bounds for rollout failure rates."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import intervalcov as ic

NS = (30, 100, 300, 1000)
GRID = ic.rate_grid(0.002, 0.2, 400)

print("# 1. Coverage over true rates 0.2%..20% (400 log-spaced rates), nominal 0.95")
print("method               n    min_cov  at_p      mean_cov  frac_rates_below_0.93")
for name, f in ic.METHODS.items():
    for n in NS:
        prof = ic.coverage_profile(f, n, GRID)
        m = min(prof)
        pm = GRID[prof.index(m)]
        below = sum(1 for c in prof if c < 0.93) / len(prof)
        print(f"{name:<20} {n:<5}{m:8.3f}  {pm:<8.4f}  {sum(prof)/len(prof):8.3f}  {below:8.2f}")

print()
print("# 2. Rollouts needed with zero failures to certify upper bound <= target")
print("method               " + "".join(f"{t:>9}" for t in (0.05, 0.01, 0.001)))
for name, f in ic.METHODS.items():
    print(f"{name:<20} " + "".join(f"{ic.zero_failure_n(f, t):>9}" for t in (0.05, 0.01, 0.001)))

print()
print("# 3. Upper bound at k failures in n = 100")
print("method               " + "".join(f"k={k:<7}" for k in (0, 1, 2, 5)))
for name, f in ic.METHODS.items():
    print(f"{name:<20} " + "".join(f"{f(k, 100):<9.4f}" for k in (0, 1, 2, 5)))

print()
print("# 4. Certify \"p < 0.05\" when the upper bound is <= 0.05, n = 100: P(certify) at the boundary p = 0.05 (a false certification) and at p = 0.02")
for name, f in ic.METHODS.items():
    b = [f(k, 100) for k in range(101)]
    cert = [u <= 0.05 for u in b]
    out = []
    for p in (0.05, 0.02):
        pm = ic.binom_pmf(100, p)
        out.append(sum(w for w, c in zip(pm, cert) if c))
    print(f"{name:<20} P(certify|p=0.05)={out[0]:.3f}  P(certify|p=0.02)={out[1]:.3f}")

print()
print("# 5. Coverage against true rate, n = 100 (rate  clopper-pearson  wilson  jeffreys  agresti-coull)")
G = ic.rate_grid(0.002, 0.2, 60)
cols = [ic.coverage_profile(ic.METHODS[m], 100, G) for m in ("clopper-pearson", "wilson", "jeffreys", "agresti-coull")]
for i, p in enumerate(G):
    print(f"{p:.4f}  " + "  ".join(f"{c[i]:.3f}" for c in cols))
