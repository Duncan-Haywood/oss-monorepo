"""Deterministic experiments; output is experiments/results.txt."""
import math, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from mix_twin import *

sigma2 = tau2 = 1.0
n = 10
a = sigma2 / n
print(f"setup: sigma=tau=1, n={n} real samples (a=sigma^2/n={a}); twin bias delta in units of sqrt(a)={math.sqrt(a):.4f}\n")

print("1. optimal weight and worth of the twin, m=1000 twin samples (b=0.001)")
m = 1000; b = tau2 / m
print("   d/sqrt(a)  delta    w*      MSE*/a   equiv real n   cap n+s2/d^2   naive-pool MSE/a")
for k in (0, 0.1, 0.25, 0.5, 1, 2, 4):
    d = k * math.sqrt(a)
    cap = n + twin_cap(sigma2, d)
    print(f"  {k:6.2f}   {d:.4f}  {w_star(a,b,d):.4f}  {mse_star(a,b,d)/a:.4f}  {equiv_real(n,sigma2,b,d):10.1f}  {cap:12.1f}  {mse_naive(n,m,sigma2,tau2,d)/a:10.3f}")

print("\n2. saturation: equivalent real samples vs twin samples m, delta=0.25*sqrt(a)=0.0791")
d = 0.25 * math.sqrt(a)
print(f"   cap sigma^2/delta^2 = {twin_cap(sigma2,d):.1f} real samples")
print("   m        equiv real samples (beyond n)   fraction of cap")
for m in (10, 100, 1000, 10000, 100000):
    e = equiv_real(n, sigma2, tau2 / m, d) - n
    print(f"  {m:6d}   {e:10.2f}                     {e/twin_cap(sigma2,d):.3f}")

print("\n3. naive equal-weight pooling vs real-only (MSE/a), tau=sigma; pooling helps iff delta^2 < a+b")
print("   delta/sqrt(a)   m=10    m=100   m=1000  m=10000   threshold sqrt((a+b)/a) at m=10,100,1000,10000")
for k in (0.25, 0.5, 1.0, 1.05, 1.2, 1.5, 2.0):
    d = k * math.sqrt(a)
    row = "  ".join(f"{mse_naive(n,mm,sigma2,tau2,d)/a:7.3f}" for mm in (10, 100, 1000, 10000))
    print(f"   {k:5.2f}         {row}")
print("   thresholds: " + ", ".join(f"m={mm}: {math.sqrt((a+tau2/mm)/a):.3f}" for mm in (10, 100, 1000, 10000)))

print("\n4. per-sample loss weight of a twin sample relative to a real one, sigma=tau=1")
print("   delta/sqrt(a)   m=10     m=100    m=1000   (weight = sigma^2/(tau^2 + m delta^2))")
for k in (0.0, 0.25, 0.5, 1, 2):
    d = k * math.sqrt(a)
    print(f"   {k:5.2f}       " + "  ".join(f"{sample_weight_ratio(sigma2,tau2,mm,d):7.4f}" for mm in (10, 100, 1000)))

print("\n5. bias unknown: exact MSE/a of adaptive weights (grid quadrature), m=1000 (b=0.001)")
m = 1000; b = tau2 / m
ests = [("real-only", lambda D: 0.0), ("plug-in", w_plugin(a, b)), ("debiased", w_debiased(a, b)),
        ("pretest5%", w_pretest(a, b)), ("naive-pool", lambda D: m / (n + m))]
print("   d/sqrt(a)  oracle  " + "  ".join(f"{nm:>10}" for nm, _ in ests))
worst = {nm: 0.0 for nm, _ in ests}
for k in (0, 0.25, 0.5, 1, 1.5, 2, 3, 5, 10):
    d = k * math.sqrt(a)
    vals = [mse_adaptive(f, a, b, d) / a for _, f in ests]
    for (nm, _), v in zip(ests, vals):
        worst[nm] = max(worst[nm], v)
    print(f"   {k:5.2f}    {mse_star(a,b,d)/a:6.3f}  " + "  ".join(f"{v:10.3f}" for v in vals))
print("   worst MSE/a over this grid: " + ", ".join(f"{nm} {v:.3f}" for nm, v in worst.items()))
