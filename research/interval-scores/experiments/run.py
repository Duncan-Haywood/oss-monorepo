import math, random
from interval_scores import *

print("E1 optimal expected interval score 4*s*phi(z)/alpha (normal, s=1) vs 400k-sample mean")
rng = random.Random(0)
ys = [rng.gauss(0, 1) for _ in range(400000)]
for a in (0.5, 0.2, 0.1, 0.05, 0.01):
    z = quantile(1 - a / 2)
    sim = sum(score(-z, z, y, a) for y in ys) / len(ys)
    print(f" alpha={a:<5g} z={z:.3f}  closed form {optimal_score(a):7.3f}   simulated {sim:7.3f}")

print("\nE2 scale misreport: regret of a symmetric interval with half-width lam*z*s (normal), in units of the optimal score")
print(" alpha   lam=0.5  0.7    0.85   1.18   1.4    2.0    | narrow(1/1.4)/wide(1.4)")
for a in (0.2, 0.1, 0.05):
    row = [scale_regret(l, a) / optimal_score(a) for l in (0.5, 0.7, 0.85, 1.18, 1.4, 2.0)]
    print(f" {a:<6g}  " + "  ".join(f"{r:6.3f}" for r in row) + f"   {scale_regret(1/1.4, a)/scale_regret(1.4, a):.2f}")

print("\nE3 common shift delta: regret vs curvature 2 f(z)/alpha * delta^2 (normal, alpha=0.1)")
for d in (0.05, 0.2, 0.5, 1.0):
    print(f" delta={d:<4g} regret {shift_regret(d, .1):.5f}  quadratic {curvature(.1)*d*d:.5f}  ratio {shift_regret(d,.1)/(curvature(.1)*d*d):.3f}")

print("\nE4 Cauchy drift (s=1, alpha=0.1): scores have no mean, paired differences do")
z = quantile(.95, "cauchy")
rng = random.Random(1)
ys = [math.tan(math.pi * (rng.random() - .5)) for _ in range(400000)]
for lam in (0.6, 1.5):
    a, b = (-lam * z, lam * z), (-z, z)
    ds = [score(*a, y, .1) - score(*b, y, .1) for y in ys]
    m = sum(ds) / len(ds)
    se = math.sqrt(sum((d - m) ** 2 for d in ds) / len(ds) ** 2)
    print(f" lam={lam}: exact regret {scale_regret(lam, .1, 'cauchy'):.4f}   paired mean {m:.4f} +- {se:.4f}")
run = 0.0
for i, y in enumerate(ys[:200000], 1):
    run += score(-z, z, y, .1)
    if i in (1000, 10000, 100000, 200000):
        print(f"   running mean of the optimal score itself after {i:>6d} tasks: {run/i:8.2f}")

print("\nE5 tasks to detect a misreported width (paired, z=1.645, normal, alpha=0.1) and a miscoverage")
zn = quantile(.95)
for lam in (0.5, 0.7, 0.85, 1.18, 1.4):
    m, v = paired_moments((-lam * zn, lam * zn), (-zn, zn), .1)
    print(f" lam={lam:<5g} regret {m:.4f}  paired var {v:.3f}  n = {detection_n(m, v):8.1f}")
print(" miscoverage alone (claimed 0.10):", ", ".join(f"true {b}: n={coverage_n(.1, b):.0f}" for b in (0.05, 0.15, 0.2)))
