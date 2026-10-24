"""Mean horizon vs initial-state error and vs parameter error. Seeded, stdlib."""
import math, os, random, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import lorenz as L

random.seed(7)
TOL, N = 1.0, 40
s = L.spin_up()
pts = []
for _ in range(N):
    for _ in range(int(random.uniform(1, 5) / 0.005)):
        s = L.rk4(s, (L.SIGMA, L.RHO, L.BETA), 0.005)
    pts.append(s)
lam = L.lyapunov(L.spin_up(), t=400.0)
out = [f"lambda_1 (Benettin, t=400) = {lam:.4f}  (published 0.9056)", f"tol={TOL}, N={N} start points on the attractor", "",
       "A. initial-state error only (twin params exact)", "delta0  mean_T  predicted ln(tol/d0)/lambda  mean-pred"]
xs, ys = [], []
for d0 in [1e-2, 1e-3, 1e-4, 1e-5, 1e-6, 1e-7]:
    m = sum(L.horizon(p, d0, TOL, tmax=40) for p in pts) / N
    pr = math.log(TOL / d0) / lam
    xs.append(math.log(d0)); ys.append(m)
    out.append(f"{d0:.0e}  {m:7.2f}  {pr:7.2f}  {m-pr:+.2f}")
n = len(xs); mx, my = sum(xs)/n, sum(ys)/n
slope = sum((x-mx)*(y-my) for x, y in zip(xs, ys)) / sum((x-mx)**2 for x in xs)
out += [f"fit slope dT/dln(1/d0) = {-slope:.3f}  vs 1/lambda = {1/lam:.3f}", "",
        "B. parameter error only (rho_twin = 28(1+eps), state exact)", "eps  mean_T"]
xs, ys = [], []
for e in [1e-1, 1e-2, 1e-3, 1e-4, 1e-5]:
    m = sum(L.horizon(p, 0.0, TOL, twin_p=(L.SIGMA, L.RHO*(1+e), L.BETA), tmax=40, dirn=(1,0,0)) for p in pts) / N
    xs.append(math.log(e)); ys.append(m); out.append(f"{e:.0e}  {m:7.2f}")
n = len(xs); mx, my = sum(xs)/n, sum(ys)/n
slope = sum((x-mx)*(y-my) for x, y in zip(xs, ys)) / sum((x-mx)**2 for x in xs)
out.append(f"fit slope dT/dln(1/eps) = {-slope:.3f}  (1/lambda = {1/lam:.3f})")
open(os.path.join(os.path.dirname(__file__), "results.txt"), "w").write("\n".join(out) + "\n")
print("\n".join(out))
