"""All numbers quoted in README.md / paper/whitepaper.md.  Seeded; pure Python."""
import math, random
from twin_shrinkage import *

REPS = 40000
print("== E1  exact James-Stein risk d-(d-2)^2 E[1/(d-2+2K)] vs simulation (delta on one coordinate); risk in units of s^2, real-only = d")
print("   d   lam    exact     sim(JS)   sim(JS+)   oracle-blend   twin-only")
for d in (3, 10, 30):
    for lam in (0.0, 1.0, d / 2, float(d), 4.0 * d):
        delta = [math.sqrt(lam)] + [0.0] * (d - 1)
        a, _ = mc_risk(lambda x: js_estimate(x, [0.0] * d, 1.0), delta, 1.0, REPS, 100 + d)
        b, _ = mc_risk(lambda x: js_plus_estimate(x, [0.0] * d, 1.0), delta, 1.0, REPS, 100 + d)
        print(f"  {d:2d} {lam:5.1f}  {js_risk(d, lam):8.4f}  {a:8.4f}  {b:8.4f}   {oracle_blend_risk(d, lam):8.4f}     {twin_only_risk(lam):7.2f}")

print("\n== E2  saving over real-only, 1 - JS/real, by twin quality (lam/d = per-parameter discrepancy in noise variances)")
print("  d \\ lam/d:    0      0.25     0.5      1        2        4        16")
for d in (3, 5, 10, 30, 100):
    print(f"  {d:3d}      " + "  ".join(f"{1 - js_risk(d, q * d) / d:6.3f}" for q in (0, .25, .5, 1, 2, 4, 16)))
print("  large-d Bayes limit 1 - q/(1+q):  " + "  ".join(f"{1 - bayes_js_ratio(q):6.3f}" for q in (0.25, .5, 1, 2, 4, 16)))
print("  twin-only risk / real-only = lam/d: it beats real-only only for lam/d < 1, JS at lam/d = 1:")
for d in (3, 10, 100):
    print(f"    d={d:3d}: JS/real at lam/d=1: {js_risk(d, d) / d:.3f}   oracle blend: {oracle_blend_risk(d, d) / d:.3f}")

print("\n== E3  the price of not knowing lam: JS risk / oracle-blend risk (both exact)")
print("  d \\ lam/d:    0.05     0.25     1        4")
for d in (3, 5, 10, 30, 100):
    print(f"  {d:3d}       " + "  ".join(f"{js_risk(d, q * d) / oracle_blend_risk(d, q * d):6.3f}" for q in (0.05, .25, 1, 4)))

print("\n== E4  twin worth in real samples: n_eq = n + sigma^2/tau^2 (large d); finite-d exact JS risk turned into an equivalent real sample count")
sig2 = 4.0
print("   tau^2  d    n   JS risk/d (units s^2=sig2/n)   real-only n giving that risk   n_eq (large d)  ratio")
for tau2 in (0.25, 1.0, 4.0):
    for d in (5, 20, 100):
        for n in (20,):
            s2 = sig2 / n
            lam = d * tau2 / s2
            per = js_risk(d, lam) / d * s2                 # per-parameter MSE
            n_real = sig2 / per                            # real-only sample count with that MSE
            print(f"   {tau2:4.2f}  {d:3d}  {n:3d}   {per:9.4f}                       {n_real:8.1f}                    {n_equivalent(n, sig2, tau2):7.1f}      {n_real / n_equivalent(n, sig2, tau2):.3f}")

print("\n== E5  the coordinate hazard (d = 10): discrepancy of size k*s in ONE parameter, twin exact in the other nine; JS toward the twin (positive part)")
d = 10
print("   k   total risk (real-only 10)   parameter-1 risk (real-only 1)   other-9 avg risk   twin-only total")
for k in (0.0, 1.0, 2.0, 3.0, 4.0, 6.0, 8.0):
    delta = [k] + [0.0] * (d - 1)
    tot, per = mc_risk(lambda x: js_plus_estimate(x, [0.0] * d, 1.0), delta, 1.0, REPS, 300 + int(k * 10))
    print(f"  {k:3.1f}   {tot:8.3f}                     {per[0]:8.3f}                        {sum(per[1:]) / 9:8.4f}          {k * k:6.2f}")
print("  worst parameter-1 risk over k in 0..12 step 0.5, by dimension")
for d in (3, 10, 30, 100):
    best = (0, 0)
    for j in range(0, 25):
        k = 0.5 * j
        delta = [k] + [0.0] * (d - 1)
        _, per = mc_risk(lambda x: js_plus_estimate(x, [0.0] * d, 1.0), delta, 1.0, 8000, 500 + j)
        if per[0] > best[0]:
            best = (per[0], k)
    print(f"    d={d:3d}: max parameter-1 risk {best[0]:.3f} at k={best[1]:.1f}")
print("  heuristic scaling of the worst case: about d/4 (k = sqrt d): d/4 = " + ", ".join(f"{dd / 4:.2f}" for dd in (3, 10, 30, 100)))

print("\n== E8  repair: shrink within blocks of g parameters (d = 30): worst risk of one badly mismatched parameter vs saving from a perfect twin")
d = 30
print("   g    saving at lam=0 (1-JS/real)   worst parameter-1 risk over k in 0..12   at k")
for g in (30, 10, 5, 3):
    tot0, _ = mc_risk(lambda x: js_blocks(x, [0.0] * d, 1.0, g), [0.0] * d, 1.0, 8000, 900 + g)
    best = (0, 0)
    for j in range(0, 25):
        k = 0.5 * j
        delta = [k] + [0.0] * (d - 1)
        _, per = mc_risk(lambda x: js_blocks(x, [0.0] * d, 1.0, g), delta, 1.0, 8000, 950 + j)
        if per[0] > best[0]:
            best = (per[0], k)
    print(f"  {g:3d}       {1 - tot0 / d:6.3f}                          {best[0]:6.3f}                 {best[1]:4.1f}")

print("\n== E6  unknown noise variance (nu df), d = 10, positive part; total risk / d; lam = 10 (per-parameter discrepancy 1)")
d, lam = 10, 10.0
delta = [math.sqrt(lam)] + [0.0] * (d - 1)
print("   nu    known-var JS+   plug-in (d-2)   Stein factor (d-2)nu/(nu+2)   real-only   (lam=0: known / plug-in / Stein)")
for nu in (4, 8, 16, 64):
    out = []
    for dl in (delta, [0.0] * d):
        rs = []
        for mode in ("known", "plug", "stein"):
            rng = random.Random(700 + nu)
            tot = 0.0
            for _ in range(REPS // 2):
                x = sample_x(dl, 1.0, rng)
                s2h = sample_chi2(nu, rng) / nu
                if mode == "known":
                    e = js_plus_estimate(x, [0.0] * d, 1.0)
                else:
                    e = js_unknown_var(x, [0.0] * d, s2h, nu, stein_factor=(mode == "stein"))
                tot += sum((a - b) ** 2 for a, b in zip(e, dl))
            rs.append(tot / (REPS // 2) / d)
        out.append(rs)
    print(f"  {nu:3d}     {out[0][0]:6.3f}          {out[0][1]:6.3f}            {out[0][2]:6.3f}                      1.000       {out[1][0]:.3f} / {out[1][1]:.3f} / {out[1][2]:.3f}")

print("\n== E7  end to end: identify d=8 plant gains by regression on a Hadamard-design experiment of n=64 rows (X^T X = 64 I), sigma=1; twin = truth + delta")
H = hadamard(6)
n, d, sigma = 64, 8, 1.0
cols = [[H[i][j] for i in range(n)] for j in range(d)]
s = sigma / math.sqrt(n)
print("  discrepancy per parameter tau (sd of delta_i, Gaussian); risk = E|theta_hat - theta|^2 over 3000 experiments, in units of real-only risk d s^2")
print("  tau/s   OLS   twin-only   JS+ (known sigma)   oracle blend   (theta redrawn each experiment: delta_i ~ N(0, tau^2))")
for q in (0.0, 0.5, 1.0, 2.0, 4.0, 8.0):
    tau = q * s
    rng = random.Random(900 + int(q * 10))
    acc = {"ols": 0.0, "twin": 0.0, "js": 0.0, "or": 0.0}
    K = 3000
    for _ in range(K):
        delta = [tau * rng.gauss(0, 1) for _ in range(d)]
        theta_T = [rng.gauss(0, 1) for _ in range(d)]
        theta = [a + b for a, b in zip(theta_T, delta)]
        y = [sum(cols[j][i] * theta[j] for j in range(d)) + sigma * rng.gauss(0, 1) for i in range(n)]
        ols = [sum(cols[j][i] * y[i] for i in range(n)) / n for j in range(d)]
        js = js_plus_estimate(ols, theta_T, s * s)
        lam = sum(v * v for v in delta) / (s * s)
        w = lam / (lam + d)
        orc = [t + w * (o - t) for t, o in zip(theta_T, ols)]
        err = lambda e: sum((a - b) ** 2 for a, b in zip(e, theta))
        acc["ols"] += err(ols); acc["twin"] += err(theta_T); acc["js"] += err(js); acc["or"] += err(orc)
    base = acc["ols"] / K
    print(f"  {q:4.1f}   {acc['ols'] / K / (d * s * s):5.3f}   {acc['twin'] / K / (d * s * s):7.3f}   {acc['js'] / K / (d * s * s):8.3f}            {acc['or'] / K / (d * s * s):8.3f}")
