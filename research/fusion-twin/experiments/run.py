"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math, random
from fusion_twin import *

print("n redundant sensors, error variance s2=1 each, equal-weight fusion. Twin: independent errors. Real: pairwise correlation rho.")

print("\n== 0. Variance formula vs simulation (2e5 draws) ==")
print("n   rho   exact var   simulated")
rng = random.Random(5)
for n, rho in ((4, 0.1), (16, 0.05), (16, 0.3), (64, 0.05)):
    N = 200000
    v = sum((sum(sample_errors(rng, n, rho)) / n) ** 2 for _ in range(N)) / N
    print("%-3d %.2f  %.4f      %.4f" % (n, rho, fused_var(1.0, rho, n), v))

print("\n== 1. Real std / twin std = sqrt(1+(n-1)rho), and effective independent sensors n_eff ==")
print("rho     n=4          n=16         n=64         n=1000       floor std   1/rho")
for rho in (0.01, 0.05, 0.1, 0.3):
    cells = ["%.2fx (%5.1f)" % (math.sqrt(inflation(rho, n)), n_eff(rho, n)) for n in (4, 16, 64, 1000)]
    print("%.2f    %s   %.3f      %g" % (rho, "  ".join(cells), math.sqrt(floor_var(1.0, rho)), 1 / rho))

print("\n== 2. Sensors needed for fused std <= 0.25 (twin says %d) ==" % round(sensors_needed(1.0, 0.0, 0.25)))
print("rho     real n needed   (x twin)")
for rho in (0.0, 0.01, 0.03, 0.05, 0.06, 0.0625, 0.1):
    n = sensors_needed(1.0, rho, 0.25)
    print("%.4f  %-14s  %s" % (rho, "infeasible" if math.isinf(n) else str(math.ceil(n)), "-" if math.isinf(n) else "%.1fx" % (math.ceil(n) / 16)))

print("\n== 3. Gate |fused error| > 3 twin-stds, n=16 (nominal %.4f); 4e5 draws ==" % math.erfc(3 / math.sqrt(2)))
print("rho    exact false alarm   simulated   (x nominal)   honest gate (twin stds)")
rng = random.Random(9)
for rho in (0.01, 0.05, 0.1, 0.3):
    n, N = 16, 400000
    sd = 1 / math.sqrt(n)
    hits = sum(abs(sum(sample_errors(rng, n, rho)) / n) > 3 * sd for _ in range(N))
    fa = gate_false_alarm(rho, n)
    print("%.2f   %.4f              %.4f      %.1fx          %.2f" % (rho, fa, hits / N, fa / math.erfc(3 / math.sqrt(2)), honest_gate(rho, n)))

print("\n== 4. Repair: fit rho from T calibration epochs (8 sensors, truth known), size the fleet for std <= 0.25 ==")
print("True s2=1, rho=0.03 (needs %d sensors). 'plug-in' uses rho_hat; 'upper' uses a 90%% bootstrap upper bound." % math.ceil(sensors_needed(1.0, 0.03, 0.25)))
print("T     rule     mean rho_hat  declared infeasible  built & met  built & violated   median n built")
REP = 200
for T in (25, 100, 400):
    for rule in ("plug-in", "upper"):
        rr = random.Random(1000 + T)
        infeasible = met = viol = 0
        ns, rhos = [], []
        for _ in range(REP):
            st = [epoch_stats(sample_errors(rr, 8, 0.03)) for _ in range(T)]
            r, s2 = rho_hat(st, 8)
            rhos.append(r)
            if rule == "upper":
                r = boot_rho_upper(st, 8, rr)
            n = sensors_needed(s2, r, 0.25)
            if math.isinf(n) or n > 10 ** 6:
                infeasible += 1
                continue
            n = max(1, math.ceil(n))
            ns.append(n)
            if fused_var(1.0, 0.03, n) <= 0.0625:
                met += 1
            else:
                viol += 1
        med = sorted(ns)[len(ns) // 2] if ns else float("nan")
        print("%-5d %-8s %.4f        %3d/%d               %3d/%d      %3d/%d            %s" % (T, rule, sum(rhos) / REP, infeasible, REP, met, REP, viol, REP, med))
