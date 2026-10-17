"""Experiments E1-E4. Deterministic (seeded). Stdlib only."""
import math, random
from kelly_markets import *


def bern(rng, p, n):
    return [1 if rng.random() < p else 0 for _ in range(n)]


print("E1  static experts, y~Bern(0.7), N=10, T=2000, 20 seeds: mean regret vs best expert vs bound ln N / lam")
qs = [0.1 + 0.8 * i / 9 for i in range(10)]
print("lam    mean_regret  bound   ratio")
for lam in (1.0, 0.5, 0.2, 0.1, 0.05, 0.02):
    rs = []
    for seed in range(20):
        rng = random.Random(seed)
        ys = bern(rng, 0.7, 2000)
        r = run([1.0] * 10, [lam] * 10, qs, ys)
        rs.append(r["loss"] - min(r["expert_loss"]))
    m = sum(rs) / len(rs)
    b = regret_bound(0.1, lam)
    print(f"{lam:<6} {m:10.3f}  {b:7.2f}  {m / b:.2f}")

print("\nE2  cost of moving the price from p0=0.5 (rest calibrated); Kelly V=1 vs LMSR b=2V (same small-shift depth)")
print("p     kelly V*chi2  lmsr b*KL   ratio  lam-weight needed (q=1)")
for p in (0.55, 0.6, 0.7, 0.8, 0.9, 0.95, 0.99):
    k, l = manip_cost(1.0, 0.5, p), lmsr_cost(2.0, 0.5, p)
    print(f"{p:<5} {k:11.4f}  {l:9.4f}  {k / l:5.2f}  {manip_lambda_weight(1.0, 0.5, 1.0, p):8.3f}")
# exact enumeration check
V, p0, q, p = 1.0, 0.5, 1.0 - 1e-9, 0.8
Lam = manip_lambda_weight(V, p0, q, p)
print("enumeration check (p=0.8): expected manipulator wealth change under truth 0.5 =",
      round(expected_transfer(Lam, 1.0, q, p, p0), 6), " -V*chi2 =", round(-manip_cost(V, p0, p), 6))

print("\nE3  switching truth (0.8 <-> 0.2 every P rounds), experts q=0.8 and 0.2, T=4000, 20 seeds")
print("(P<=600 keeps full-Kelly wealth ratios above float underflow, about e^-745)")
print("regret is vs the oracle that picks the right expert in every segment; best lam per period P")
grid = (1.0, 0.5, 0.3, 0.2, 0.1, 0.05, 0.02, 0.01)
print("P      " + "".join(f"lam={g:<6}" for g in grid) + " best")
for P in (25, 50, 100, 250, 400, 600):
    row = []
    for lam in grid:
        rs = []
        for seed in range(20):
            rng = random.Random(100 + seed)
            ys, orc = [], 0.0
            for t in range(4000):
                pi = 0.8 if (t // P) % 2 == 0 else 0.2
                y = 1 if rng.random() < pi else 0
                ys.append(y)
                orc -= math.log(0.8 if (y == 1) == (pi == 0.8) else 0.2)
            r = run([1.0, 1.0], [lam, lam], [0.8, 0.2], ys)
            rs.append(r["loss"] - orc)
        row.append(sum(rs) / len(rs))
    best = grid[row.index(min(row))]
    print(f"{P:<6} " + "".join(f"{x:<10.1f}" for x in row) + f" {best}")

print("\nE4  overconfident trader: price p=0.7, belief q=0.95, truth pi=0.8 -> growth-optimal lam*=(pi-p)/(q-p)")
p, q, pi = 0.7, 0.95, 0.8
print("lam*  =", round(optimal_lambda(pi, p, q), 4))
print("lam    growth/round   MC log-wealth/round (T=200000)")
rng = random.Random(7)
ys = bern(rng, pi, 200000)
for lam in (0.1, 0.2, 0.4, 0.6, 0.8, 1.0):
    lw = sum(math.log(1 - lam + lam * (q / p if y else (1 - q) / (1 - p))) for y in ys) / len(ys)
    print(f"{lam:<6} {growth(lam, q, p, pi):+.5f}      {lw:+.5f}")
print("belief-truth gap: full Kelly (lam=1) growth is", round(growth(1.0, q, p, pi), 5),
      "; growth is negative for lam beyond", next(l / 1000 for l in range(1, 1001) if growth(l / 1000, q, p, pi) < 0)
      if growth(1.0, q, p, pi) < 0 else "never (stays positive on [0,1])")
