"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math, random
from deadband_twin.model import *

print("Deadband twin: real actuator has deadband d, twin has none. Servo x+ = x + dz(-k x), x0 = 5.")

print("\n== 1. Resting error of the real loop (twin predicts 0), 2000 steps ==")
print("d      k     twin final |x|   real final |x|   exact d/k    min over run - d/k")
for d, k in ((0.05, 0.5), (0.2, 0.4), (0.2, 0.9), (0.5, 0.1)):
    tw = run_servo(5.0, k, 0.0, 2000)[-1]
    re = run_servo(5.0, k, d, 2000)
    print("%-6g %-5g %-16.2e %-16.6f %-12.6f %.2e" % (d, k, abs(tw), abs(re[-1]), stall_error(d, k), min(re) - stall_error(d, k)))

print("\n== 2. Certifying a tolerance eps: twin says any k works; real loop needs k >= d/eps (d=0.2, k <= 1) ==")
print("eps     twin steps (k=0.4)   real final |x| (k=0.4)   k needed   real final |x| at k needed (capped at 1)")
for eps in (0.5, 0.2, 0.05):
    kn = k_needed(0.2, eps)
    kk = min(kn, 1.0)
    print("%-7g %-20d %-24.4f %-10.3f %.4f" % (eps, steps_to(5.0, 0.4, eps), abs(run_servo(5.0, 0.4, 0.2, 2000)[-1]), kn, abs(run_servo(5.0, kk, 0.2, 2000)[-1])))

print("\n== 3. Gain a linear twin fits from Gaussian excitation of std s (d=1): population 2Q(d/s) vs simulated (n=400000) ==")
print("s      2Q(d/s)   simulated   small-signal true gain")
rng = random.Random(5)
for s in (0.25, 0.5, 1.0, 2.0, 5.0):
    print("%-6g %-9.4f %-11.4f 0" % (s, gain_gaussian(1.0, s), fit_gain(1.0, s, 400000, rng)))
print("\n== 4. Identifying d by bisection on [0,1] with n real probes, d=0.3137; then compensating (k=0.4) ==")
print("n   d_hat      |d_hat-d|   bound       real stall |x|   exact   (no compensation: %.4f)" % stall_error(0.3137, 0.4))
for n in (0, 2, 4, 6, 8, 12):
    dh = bisect_deadband(0.3137, 0.0, 1.0, n)
    r = abs(run_servo(5.0, 0.4, 0.3137, 3000, dh=dh)[-1])
    print("%-3d %-10.5f %-10.5f %-11.5f %-17.5f %.5f" % (n, dh, abs(dh - 0.3137), bisection_error_bound(0.0, 1.0, n), r, comp_error(0.3137, dh, 0.4)))

print("\n== 5. Over- vs under-compensation by the same error e = 0.1 (d=0.2, k=0.4 and 0.9) ==")
print("k     dh     real |x|   exact")
for k in (0.4, 0.9):
    for dh in (0.1, 0.3):
        print("%-5g %-6g %-10.5f %.5f" % (k, dh, abs(run_servo(5.0, k, 0.2, 3000, dh=dh)[-1]), comp_error(0.2, dh, k)))
