"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math
from slew_twin.model import (trajectory, valid_amplitude, undershoot, settle_steps, critical_ratio, crosses_zero,
                             increment_ratio)

print("Slew twin: real actuator changes its command by at most r per step, twin has no limit. x+ = x + a+, a+ = a + clip(-k x - a, -r, r).")

print("\n== 1. Where the twin is exact: max |real - twin| over 300 steps at multiples of A = r/k (r = 0.05) ==")
print("k     A=r/k    0.999A     1.01A      2A         10A        increment_ratio")
for k in (0.1, 0.3, 0.6):
    r = 0.05
    A = valid_amplitude(k, r)
    row = []
    for m in (0.999, 1.01, 2, 10):
        real, tw = trajectory(m * A, k, r, 300), trajectory(m * A, k, n=300)
        row.append(max(abs(u - v) for u, v in zip(real, tw)) / (m * A))
    print("%-5g %-8.4f %-10.2e %-10.2e %-10.2e %-10.2e %.6f" % ((k, A) + tuple(row) + (increment_ratio(k),)))

print("\n== 2. Undershoot past zero as a fraction of x0 (twin: 0 for every x0), r = 1 ==")
rhos = (10, 100, 1000, 10000)
print("k     " + "  ".join("rho=%-7g" % v for v in rhos))
for k in (0.1, 0.3, 0.5, 0.8):
    print("%-5g " % k + "  ".join("%-11.4f" % undershoot(trajectory(v, k, 1.0, int(6 * k * v) + 4000)) for v in rhos))

print("\n== 3. Smallest rho = x0/r at which the loop crosses zero (bisection) vs 2n(2n-1) for k = 1/n ==")
print("k          rho*        2n(2n-1)")
for n in (1, 2, 3, 4, 5, 6, 8, 10, 16, 25):
    k = 1.0 / n
    print("1/%-8d %-11.4f %d" % (n, critical_ratio(k), 2 * n * (2 * n - 1)))
print("other k (no closed form found):")
for k in (0.9, 0.8, 0.7, 0.6, 0.3, 0.15):
    print("%-10g %-11.4f (2(2-k)/k^2 = %.4f)" % (k, critical_ratio(k), 2 * (2 - k) / k ** 2))

print("\n== 4. Steps to settle within 1% of x0 (and stay), r = 1 ==")
print("k     twin   " + "  ".join("rho=%-7g" % v for v in (10, 100, 1000, 10000, 100000)) + "  slope (steps per unit rho, 1e4 -> 1e5)")
for k in (0.1, 0.3, 0.5):
    tw = math.ceil(math.log(0.01) / math.log(1 - k))
    vals = [settle_steps(v, k, 1.0) for v in (10, 100, 1000, 10000, 100000)]
    print("%-5g %-6d " % (k, tw) + "  ".join("%-11d" % v for v in vals) + "  %.4f" % ((vals[4] - vals[3]) / 90000))

print("\n== 5. A twin validated at small amplitude (k = 0.3, r = 0.05, A = %.4f) ==" % valid_amplitude(0.3, 0.05))
print("x0      rho     twin steps  real steps  real undershoot")
for x0 in (0.1, 0.16, 0.5, 2.0, 10.0):
    print("%-7g %-7g %-11d %-11d %.4f" % (x0, x0 / 0.05, math.ceil(math.log(0.01) / math.log(0.7)), settle_steps(x0, 0.3, 0.05),
                                          undershoot(trajectory(x0, 0.3, 0.05, 4000))))
print("\n== 6. Rate limit needed for a target amplitude x0 = 10, k = 0.3: exact twin (r >= k x0), no overshoot (r >= x0/rho*) ==")
print("k=0.3: twin exact r >= %.3f; no overshoot r >= %.3f (rho* = %.4f)" % (0.3 * 10, 10 / critical_ratio(0.3), critical_ratio(0.3)))
print("k=0.1: twin exact r >= %.3f; no overshoot r >= %.3f (rho* = %.4f)" % (0.1 * 10, 10 / critical_ratio(0.1), critical_ratio(0.1)))
