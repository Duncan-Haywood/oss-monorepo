import math, os, random, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from aliasing_twin import *

V, s = 10.0, 1.0
print("Doppler aliasing twin. Unambiguous velocity V=%g, return noise s=%g (units arbitrary, e.g. m/s)." % (V, s))

print("\n== 1. Bias of a wrapped return vs true speed mu (twin: 0). Exact; Monte Carlo 200,000 draws ==")
rng = random.Random(1)
print("mu     exact bias   MC bias (+-se)      exact MSE1   MC MSE1")
for mu in (6.0, 8.0, 9.0, 10.0, 11.0, 14.0):
    ys = [wrap(mu + rng.gauss(0, s), V) - mu for _ in range(200000)]
    m = sum(ys) / len(ys)
    se = math.sqrt(sum((y - m) ** 2 for y in ys) / len(ys) / len(ys))
    q = sum(y * y for y in ys) / len(ys)
    print("%-6g %-12.5f %-8.4f +-%-8.4f  %-12.4f %.4f" % (mu, bias(mu, s, V), m, se, mse1(mu, s, V), q))

print("\n== 2. Real MSE of the mean of n returns over the twin's claim s^2/n (exact); MC check at mu=8.5, n=10 ==")
print("mu     n=1        n=10       n=100      n=10000")
for mu in (6.0, 8.0, 9.0, 9.5, 10.0):
    print("%-6g %s" % (mu, "  ".join("%-9.4g" % mse_ratio(n, mu, s, V) for n in (1, 10, 100, 10000))))
m, se = mc_mean_mse(10, 8.5, s, V, 40000, random.Random(2))
print("n=10, mu=8.5: exact %.5f, MC %.5f +- %.5f (40,000 repeats)" % (mse_mean(10, 8.5, s, V), m, se))
print("floor: bias^2 (n->inf) at mu=9: %.4f (twin claims s^2/n -> 0)" % (bias(9.0, s, V) ** 2))

print("\n== 3. Speed the twin over-certifies: largest mu with |bias| <= tol (exact) vs leading term V + s*Phi^-1(tol/2V) ==")
def ppf(p):
    lo, hi = -10.0, 10.0
    for _ in range(100):
        mid = (lo + hi) / 2
        if 0.5 * math.erfc(-mid / math.sqrt(2)) < p: lo = mid
        else: hi = mid
    return lo
print("tol    s     safe mu   leading term   safe mu / V")
for tol in (0.01, 0.1, 1.0):
    for ss in (0.5, 1.0, 2.0):
        sm = safe_speed(tol, ss, V)
        print("%-6g %-5g %-9.4f %-14.4f %.3f" % (tol, ss, sm, V + ss * ppf(tol / (2 * V)), sm / V))

print("\n== 4. Unwrapping each return against a prior speed (error sp): exact failure probability and MSE ==")
print("(mu=3, V=10, s=1; MC 150,000 draws)")
print("sp    P(fail) exact   MSE exact   MC MSE (+-se)        twin claim")
for sp in (2.0, 4.0, 6.0, 8.0, 10.0):
    m, se = mc_unwrapped_mse(3.0, s, sp, V, 150000, random.Random(int(sp)))
    print("%-5g %-15.3e %-11.4f %-8.4f +-%-8.4f  %.4f" % (sp, unwrap_fail_prob(s, sp, V), mse_unwrapped(s, sp, V), m, se, s * s))
print("\nprior error sp needed for MSE within 10%% of s^2 (V=%g, s=%g):" % (V, s))
for tgt in (1.1,):
    lo, hi = 0.1, 100.0
    for _ in range(100):
        mid = (lo + hi) / 2
        if mse_unwrapped(s, mid, V) / (s * s) < tgt: lo = mid
        else: hi = mid
    print("  sp = %.3f = %.3f V" % (lo, lo / V))
