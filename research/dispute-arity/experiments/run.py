import math
from dispute_arity import *
T = 10**6
print("== 1. continuous optimum k*(a/b) and binary threshold")
print("binary optimal iff a/b <= 2ln2-1 = %.4f" % BINARY_THRESHOLD)
for r in (0.2, 0.386, 1, 3, 10, 30, 100, 1000): print("a/b=%7.1f  k*=%7.3f" % (r, k_star(r)))
print("\n== 2. integer optimum for T=10^6, m=1 (b=1): best uniform k vs binary vs adaptive DP")
for a in (0.25, 1, 5, 10, 30, 100, 1000):
    bu = best_uniform(T, 1, a, 1.0, kmax=200); bin_ = uniform_cost(T, 2, 1, a, 1.0, 0); dp, sch = dp_schedule(T, 1, a, 1.0, kmax=200)
    print("a=%6.2f  binary=%9.1f (%2d rds)  uniform k=%3d cost=%8.1f (%.2fx cheaper)  adaptive=%8.1f  sched=%s" %
          (a, bin_, rounds(T, 2), bu[1], bu[0], bin_ / bu[0], dp, list(sch)[:8]))
print("\n== 3. gap of uniform to adaptive across T (a=10,b=1): adaptive gains from integer effects")
for t in (10**3, 10**4, 5*10**4, 10**5, 10**6):
    bu = best_uniform(t, 1, 10, 1.0, kmax=200); dp = dp_schedule(t, 1, 10, 1.0, kmax=200)[0]
    print("T=%8d uniform=%8.2f (k=%d)  adaptive=%8.2f  saving %.1f%%" % (t, bu[0], bu[1], dp, 100 * (1 - dp / bu[0])))
print("\n== 4. leaf size: referee re-executes m steps at cost c each (T=10^6, a=10, b=1)")
for c in (0, 0.001, 0.01, 0.1, 1, 10, 100):
    cost, m = best_leaf(T, 10, 1, c); full = dp_schedule(T, 1, 10, 1.0, kmax=200)[0] + c
    print("c=%7.3f  best leaf m=%7d  total=%9.2f   vs full bisection=%9.2f  (%.1f%% saved)" % (c, m, cost, full, 100 * (1 - cost / full)))
print("\n== 5. latency: per-round fixed cost a = gas + lambda*L pushes toward wider arity (b=1, base gas 5)")
for lam_L in (0, 5, 20, 100, 500):
    a = 5 + lam_L; dp, sch = dp_schedule(T, 1, a, 1.0, kmax=400)
    print("lambda*L=%4d  a=%4d  rounds=%2d  arities=%s  cost=%.1f" % (lam_L, a, len(sch), list(sch), dp))
print("\n== 6. executed protocol on a hash chain (T=1000, k=10): every corrupt position localised")
h = make_trace(1000); worst = 0; wp = 0; ok = True
for j in range(1000):
    (lo, hi), r, p = dispute(h, make_trace(1000, j), 10); ok &= (lo, hi) == (j, j + 1); worst = max(worst, r); wp = max(wp, p)
print("all localised:", ok, " max rounds:", worst, "(theory %d)" % rounds(1000, 10), " max checkpoints posted:", wp, "(theory %d)" % (rounds(1000, 10) * 9))
