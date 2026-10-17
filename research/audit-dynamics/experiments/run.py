"""Experiments for audit-dynamics. Run: PYTHONPATH=src python3 experiments/run.py"""
import math
from audit_dynamics import (Params, equilibrium, potential, period, hedge, replicator_rk4,
                            stochastic_hedge, omega)

p = Params(s=1.0, S=4.0, k=0.5, lam=0.5, h=0.0)
xs_, ys_ = equilibrium(p)
print(f"equilibrium x*={xs_:.3f} y*={ys_:.3f}  omega={omega(p):.3f}")


def crossings(seq, level):
    return [i for i in range(1, len(seq)) if seq[i - 1] < level <= seq[i]]


print("\n[1] period of small oscillations: predicted 2*pi/(eta*omega) vs measured (Hedge, start near eq.)")
for eta in (0.002, 0.005, 0.01):
    T = int(8 * period(p, eta))
    x, y = hedge(p, eta, T, x0=xs_ + 0.01, y0=ys_)
    c = crossings(x, xs_)
    meas = (c[-1] - c[0]) / (len(c) - 1)
    print(f"  eta={eta}: predicted {period(p, eta):8.1f}  measured {meas:8.1f}")

print("\n[2] potential H=KL(x*||x)+KL(y*||y): flow conserves, Hedge grows, optimistic Hedge shrinks")
rk = replicator_rk4(p, 0.001, 20, x0=0.3, y0=0.3)
print(f"  replicator (RK4, t=20): H {potential(p,*rk[0]):.5f} -> {potential(p,*rk[-1]):.5f}")
for eta in (0.01, 0.05, 0.1):
    x, y = hedge(p, eta, 5000, x0=0.3, y0=0.3)
    xo, yo = hedge(p, eta, 5000, x0=0.3, y0=0.3, optimistic=True)
    print(f"  eta={eta}: Hedge H {potential(p,x[0],y[0]):.3f} -> {potential(p,x[-1],y[-1]):.3f} | "
          f"OptHedge final (x,y)=({xo[-1]:.4f},{yo[-1]:.4f})")

print("\n[3] how bad are the cycles? (Hedge, T=20000, start at equilibrium+perturbation)")
print("  eta   avg x   avg y  | frac rounds x>2x*  frac rounds y<y*/2 | mean x_t*y_t vs x*y*  | last-iterate (x,y)")
for eta in (0.005, 0.02, 0.05, 0.1):
    T = 20000
    x, y = hedge(p, eta, T, x0=0.3, y0=0.3)
    n = len(x)
    ax, ay = sum(x) / n, sum(y) / n
    f1 = sum(v > 2 * xs_ for v in x) / n
    f2 = sum(v < ys_ / 2 for v in y) / n
    xy = sum(a * b for a, b in zip(x, y)) / n
    print(f"  {eta:5}  {ax:.3f}  {ay:.3f}  |      {f1:.3f}              {f2:.3f}        |  {xy:.4f} vs {xs_*ys_:.4f}  |"
          f" ({x[-1]:.3f},{y[-1]:.3f})")

print("\n[3b] time-average error of Hedge: |avg x - x*| vs horizon T (eta=0.05)")
for T in (1000, 4000, 16000, 64000):
    x, y = hedge(p, 0.05, T, x0=0.3, y0=0.3)
    n = len(x)
    print(f"  T={T:6d}: |avg x-x*|={abs(sum(x)/n-xs_):.4f}  |avg y-y*|={abs(sum(y)/n-ys_):.4f}")

print("\n[4] optimistic Hedge last-iterate distance to equilibrium (eta=0.1)")
for T in (100, 300, 1000, 3000):
    x, y = hedge(p, 0.1, T, x0=0.3, y0=0.3, optimistic=True)
    print(f"  T={T:5d}: |x-x*|={abs(x[-1]-xs_):.2e} |y-y*|={abs(y[-1]-ys_):.2e}")

print("\n[5] Hedge on sampled actions, eta_t=eta0/sqrt(t) (mean of 20 seeds)")
for T in (1000, 10000, 100000):
    ex, ey, lx, ly = [], [], [], []
    for sd in range(20):
        x, y, cheats, checks = stochastic_hedge(p, 0.5, T, seed=sd)
        ex.append(abs(cheats / T - xs_)); ey.append(abs(checks / T - ys_))
        lx.append(abs(x[-1] - xs_)); ly.append(abs(y[-1] - ys_))
    m = lambda v: sum(v) / len(v)
    print(f"  T={T:6d}: empirical-freq err x {m(ex):.4f} y {m(ey):.4f} | last-iterate err x {m(lx):.4f} y {m(ly):.4f}")

print("\n[6] scale-free step: hold eta*C fixed (C=(s+S)(lam S+h)) so stake does not change the effective step; Hedge T=5000, x0=x*+.05")
for S in (2.0, 4.0, 8.0, 16.0):
    q = Params(1.0, S, 0.5)
    a, b = equilibrium(q)
    C = (q.s + q.S) * (q.lam * q.S + q.h)
    eta = 0.05 / C
    x, y = hedge(q, eta, 5000, x0=a + 0.05, y0=b)
    Hs = [potential(q, u, v) for u, v in zip(x, y)]
    print(f"  S={S:5}: x*={a:.3f} y*={b:.3f} min y_t={min(y):.2e} max x_t={max(x):.3f} H0={Hs[0]:.4f} H_T={Hs[-1]:.3f}")
