"""Grip force chosen in a digital twin. Base case: real friction mu = 0.5 (log-sd 0.3), crush force 6 w0 (log-sd 0.15), Ls = Lc = 1."""
import math, os, random, statistics, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from grasp_twin.model import *

REAL = Params(math.log(0.5), 0.3, math.log(6), 0.15)
J0 = loss(REAL, x_star(REAL))

print("== 1. Closed form vs numeric optimum vs Monte Carlo (400k grasps each), real model")
x = x_star(REAL)
print("x* closed form %.7f  numeric %.7f  F* = %.4f w0  J* = %.6f (slip %.5f + crush %.5f)" % (x, x_star_numeric(REAL), math.exp(x), J0, slip(REAL, x), crush(REAL, x)))
rng = random.Random(0)
for xx in (x, x - 0.3, x + 0.3):
    sl, cr = simulate_grasps(REAL, xx, 400_000, rng)
    print("x=%.3f  slip exact %.5f mc %.5f | crush exact %.5f mc %.5f" % (xx, slip(REAL, xx), sl, crush(REAL, xx), cr))

print("\n== 2. Too-clean twin: friction spread s_twin (real 0.3), everything else correct")
print("%-8s %-8s %-14s %-13s %-9s %-10s %-9s" % ("s_twin", "F(w0)", "twin-claimed J", "real J", "regret", "real slip", "regret/J*"))
for st in (0.3, 0.2, 0.15, 0.1, 0.05):
    tw = REAL.replace(s=st)
    xt, _, jr_t, _ = twin_policy(REAL, tw)
    print("%-8.2f %-8.3f %-14.2e %-13.5f %-9.5f %-10.5f %-9.1f" % (st, math.exp(xt), loss(tw, xt), jr_t, jr_t - J0, slip(REAL, xt), (jr_t - J0) / J0))
print("Plateau of a spread -> 0 twin (s_twin=0.01): the twin's loss is ~0 on a whole window, so its optimum is not unique.")
tw = REAL.replace(s=0.01)
lo = -tw.m                        # slip edge of the twin: mu_hat F = 1
hi = tw.f - 3 * tw.r              # crush edge (3 sd below the median crush force)
for name, xx in (("lower edge (mu_hat F = 1)", lo), ("middle", (lo + hi) / 2), ("upper edge (3 sd below crush)", hi)):
    print("  %-30s F=%.3f w0  twin J %.2e  real J %.5f  real slip %.4f" % (name, math.exp(xx), loss(tw, xx), loss(REAL, xx), slip(REAL, xx)))

print("\n== 3. Biased twin friction (m_twin = m + delta), spread correct")
print("%-8s %-8s %-9s %-9s %-10s %-9s" % ("delta", "mu_twin", "F(w0)", "regret", "regret/J*", "real slip"))
for d in (-0.4, -0.3, -0.15, -0.05, 0.05, 0.15, 0.3, 0.4):
    tw = REAL.replace(m=REAL.m + d)
    xt, _, jr_t, _ = twin_policy(REAL, tw)
    print("%-8.2f %-8.3f %-9.3f %-9.5f %-10.2f %-9.5f" % (d, math.exp(tw.m), math.exp(xt), jr_t - J0, (jr_t - J0) / J0, slip(REAL, xt)))
# quadratic approximation of the regret
print("quadratic approx 0.5 J''(x*) (x_twin - x*)^2 vs exact:")
e = 1e-5
J2 = (loss(REAL, x + e) - 2 * loss(REAL, x) + loss(REAL, x - e)) / e ** 2
for d in (0.05, 0.15, 0.3):
    tw = REAL.replace(m=REAL.m + d)
    print("  delta=%.2f  approx %.5f exact %.5f" % (d, 0.5 * J2 * (x_star(tw) - x) ** 2, regret(REAL, tw)))

print("\n== 4. Domain randomisation: replace the twin's friction spread by a width w (twin nominal friction biased by delta)")
widths = [0.05 + 0.01 * i for i in range(96)]
print("%-8s %-10s %-10s %-12s %-12s %-12s" % ("delta", "best w", "min regret", "regret w=0.1", "regret w=0.3", "regret w=0.6"))
for d in (0.0, 0.15, 0.3, -0.15, -0.3):
    tw = REAL.replace(m=REAL.m + d)
    regs = [(regret(REAL, dr_params(tw, w)), w) for w in widths]
    r0, w0 = min(regs)
    print("%-8.2f %-10.2f %-10.2e %-12.5f %-12.5f %-12.5f" % (d, w0, r0, regret(REAL, dr_params(tw, 0.1)), regret(REAL, dr_params(tw, 0.3)), regret(REAL, dr_params(tw, 0.6))))
print("The best width depends on the (unknown) bias: a width that cancels delta=+0.3 is not zero-regret for delta=-0.3:")
tw = REAL.replace(m=REAL.m + 0.3)
wbest = min(widths, key=lambda w: regret(REAL, dr_params(tw, w)))
for d in (0.3, 0.15, 0.0, -0.15, -0.3):
    print("  width %.2f (tuned for +0.3), actual delta %+.2f: regret %.5f" % (wbest, d, regret(REAL, dr_params(REAL.replace(m=REAL.m + d), wbest))))

print("\n== 5. Calibration budget: plug-in force from n real friction measurements (2000 fits each)")
print("%-6s %-12s %-9s %-14s %-9s %-10s" % ("n", "mean regret", "s.e.", "median regret", "delta", "delta/mean"))
for n in (5, 10, 20, 50, 100, 400, 1000):
    rng = random.Random(1000 + n)
    regs = [regret(REAL, fit_plugin(REAL, n, rng)) for _ in range(2000)]
    mean = statistics.fmean(regs)
    print("%-6d %-12.5f %-9.5f %-14.5f %-9.5f %-10.2f" % (n, mean, statistics.stdev(regs) / math.sqrt(len(regs)), statistics.median(regs), regret_delta(REAL, n), regret_delta(REAL, n) / mean))
rng = random.Random(7)
for n in (5, 10, 20):
    regs = [regret(REAL, fit_plugin(REAL, n, rng)) for _ in range(2000)]
    print("n=%d: fraction of fits whose real risk beats the too-clean twin (s_twin=0.1): %.3f" % (n, sum(r < regret(REAL, REAL.replace(s=0.1)) for r in regs) / len(regs)))
