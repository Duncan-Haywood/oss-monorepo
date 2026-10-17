"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math
from jitter_twin.model import (as_critical_gain, const_critical_gain, effective_delay, lyapunov, ms_critical_gain,
                               ms_rho, stationary_var)

INF = float("inf")
HALF = [0.5, 0.5]
print("Jitter twin: x[n+1] = x[n] - k x[n-d_n] + w[n], w ~ N(0,1). Twin: constant delay = mean delay. Real: random delay d_n, same marginal law.")

print("\n== 1. Twin thresholds: constant delay d is stable iff k < 2 sin(pi/(2(2d+1))) ==")
print("d   closed form   numerical MS threshold")
for d in range(0, 5):
    print("%-3d %-13.6f %.6f" % (d, const_critical_gain(d), ms_critical_gain([d], [1.0])))

print("\n== 2. i.i.d. jitter with the twin's mean delay ==")
print("delay law (uniform over)   mean   twin d=mean  MS crit gain   effective delay   a.s. crit gain")
for name, dl, mean in (("{0,2}", [0, 2], 1), ("{0,1,2}", [0, 1, 2], 1), ("{0,1,2,3,4}", [0, 1, 2, 3, 4], 2), ("{1,3}", [1, 3], 2)):
    pr = [1.0 / len(dl)] * len(dl)
    kc = ms_critical_gain(dl, pr)
    ka = as_critical_gain(dl, pr)
    print("%-26s %-6g %-12.4f %-14.4f %-17.3f %.3f" % (name, mean, const_critical_gain(mean), kc, effective_delay(kc), ka))
print("{0,2} with P(d=2) = p: MS critical gain kc against the fit k(k+1) = 1/p")
print("p      kc        kc*(kc+1)   1/p")
for p in (0.2, 0.35, 0.5, 0.65, 0.8, 0.95):
    kc = ms_critical_gain([0, 2], [1 - p, p])
    print("%-6g %-9.5f %-11.5f %.5f" % (p, kc, kc * (kc + 1), 1 / p))
print("stationary Var(x), twin (d=1) vs real i.i.d. {0,2}, and {0,1,2}:")
print("k      twin         real {0,2}   real {0,1,2}")
for k in (0.3, 0.5, 0.8, 0.95):
    print("%-6g %-12.6f %-12.6f %.6f" % (k, stationary_var(k, [1], [1.0]), stationary_var(k, [0, 2], HALF), stationary_var(k, [0, 1, 2], [1 / 3] * 3)))

print("\n== 3. Persistence of the delay (same marginal {0,2}, P = 1/2 each; lag-1 autocorrelation of the delay = rho) ==")
print("rho    MS crit gain   effective delay   a.s. crit gain   Var(x) at k=0.5   Var(x) at k=0.6")
for rho in (0.0, 0.3, 0.5, 0.7, 0.9, 0.95, 0.99):
    kc = ms_critical_gain([0, 2], HALF, rho)
    ka = as_critical_gain([0, 2], HALF, rho)
    v5 = stationary_var(0.5, [0, 2], HALF, rho)
    v6 = stationary_var(0.6, [0, 2], HALF, rho)
    print("%-6g %-14.4f %-17.3f %-16.3f %-17.4f %.4f" % (rho, kc, effective_delay(kc), ka, v5, v6))
print("(twin: threshold %.4f, Var(x) at k=0.5: %.4f, at k=0.6: %.4f; worst-case constant delay 2: threshold %.4f)" % (
    const_critical_gain(1), stationary_var(0.5, [1], [1.0]), stationary_var(0.6, [1], [1.0]), const_critical_gain(2)))

print("\n== 4. A gain the twin certifies: persistence at which it stops being mean-square stable ==")
print("k (fraction of twin threshold 1)   smallest rho with MS instability   Var(x), twin   Var(x) at rho=0.9")
for k in (0.5, 0.6, 0.65, 0.7, 0.8, 0.9, 0.95):
    if ms_rho(k, [0, 2], HALF, 0.999, 2500) < 1.0:
        rstar = "none below 0.999 (stable worst case)"
    else:
        lo, hi = 0.0, 0.999
        for _ in range(16):
            mid = 0.5 * (lo + hi)
            if ms_rho(k, [0, 2], HALF, mid, 1500) >= 1.0:
                hi = mid
            else:
                lo = mid
        rstar = "%.3f" % (0.5 * (lo + hi))
    print("%-34g %-37s %-14.4f %s" % (k, rstar, stationary_var(k, [1], [1.0]), stationary_var(k, [0, 2], HALF, 0.9)))

print("\n== 5. Mean square vs almost sure, i.i.d. {0,2} ==")
print("k      E|s|^2 growth/step   a.s. exponent/step")
for k in (0.9, 1.1, 1.3, 1.6, 1.8, 2.0):
    print("%-6g %-20.4f %.4f" % (k, ms_rho(k, [0, 2], HALF), lyapunov(k, [0, 2], HALF, n=100000)))
