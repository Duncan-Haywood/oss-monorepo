"""Experiments for gnss-twin; all numbers in results.txt come from this script (seeded)."""
import math
import random

from gnss_twin.model import (sats, hdop, solve, residual_stat, ar1, mean_var_factor, chi2_sf_even, chi2_isf_even,
                             coverage_of_claim)

rng = random.Random(0)
SIG = 1.0


def hr(s):
    print("\n== " + s)


hr("1. HDOP: symmetric constellation sqrt(4/n) vs Monte Carlo rms horizontal error (sigma = 1)")
for n in (4, 6, 8, 12):
    az = sats(n)
    R = 20000
    mse = 0.0
    for _ in range(R):
        dx, dy, _ = solve(az, [rng.gauss(0, SIG) for _ in range(n)])
        mse += dx * dx + dy * dy
    print(f"n={n:2d}  hdop {hdop(az):.4f}  closed form {math.sqrt(4 / n):.4f}  simulated rms {math.sqrt(mse / R):.4f}")
for span_deg in (360, 180, 90, 60):
    print(f"n=8 satellites over a {span_deg:3d} deg arc: hdop {hdop(sats(8, 0, math.radians(span_deg))):.2f}")

hr("2. One biased satellite (b = 5 m) maps to horizontal error 2b/n, pointing at the satellite")
for n in (6, 8, 12):
    az = sats(n)
    e = [0.0] * n
    e[1] = 5.0
    dx, dy, db = solve(az, e)
    print(f"n={n:2d}  |error| {math.hypot(dx, dy):.4f}  2b/n {2 * 5 / n:.4f}  bearing {math.degrees(math.atan2(dy, dx)):.1f} "
          f"(satellite {math.degrees(az[1]):.1f})  clock {db:.4f} = b/n {5 / n:.4f}")

n, rho, s = 8, 0.99, 2.0
az = sats(n)
print(f"{'T':>5} {'twin rms':>9} {'real rms (sim)':>15} {'exact':>8}")
R = 1500
for T in (1, 10, 100, 500):
    mse = 0.0
    for _ in range(R):
        series = [ar1(rng, T, rho, s) for _ in range(n)]
        e = [sum(series[i]) / T + rng.gauss(0, SIG) / math.sqrt(T) for i in range(n)]
        dx, dy, _ = solve(az, e)
        mse += dx * dx + dy * dy
    exact = math.sqrt(4 / n * (SIG ** 2 / T + s ** 2 * mean_var_factor(T, rho)))
    twin = math.sqrt(4 / n * SIG ** 2 / T)
    print(f"{T:5d} {twin:9.4f} {math.sqrt(mse / R):15.4f} {exact:8.4f}")

hr("4. Coverage of the 95% radius of a twin calibrated on single epochs (total variance sigma^2 + s^2 per satellite), then averaged")
print(f"{'T':>5} {'claimed':>8} {'exact':>7} {'simulated':>10}")
R = 3000
for T in (1, 10, 100):
    var_twin = 4 / n * (SIG ** 2 + s ** 2) / T / 2      # per-axis variance of the twin's T-epoch mean
    var_real = 4 / n * (SIG ** 2 / T + s ** 2 * mean_var_factor(T, rho)) / 2
    rad2 = -2 * var_twin * math.log(0.05)
    hit = 0
    for _ in range(R):
        series = [ar1(rng, T, rho, s) for _ in range(n)]
        e = [sum(series[i]) / T + rng.gauss(0, SIG) / math.sqrt(T) for i in range(n)]
        dx, dy, _ = solve(az, e)
        hit += dx * dx + dy * dy <= rad2
    print(f"{T:5d} {0.95:8.2f} {coverage_of_claim(var_twin, var_real):7.3f} {hit / R:10.3f}")

hr("5. Residual integrity test (n = 9, 6 dof) tuned to 1e-2 false alarms on the twin")
n = 9
az = sats(n)
thr = chi2_isf_even(0.01, n - 3)
print(f"threshold {thr:.3f} (sigma^2 units)")
R = 40000
for s_m in (0.0, 0.5, 1.0, 2.0):
    fa = sum(residual_stat(az, [rng.gauss(0, math.hypot(SIG, s_m)) for _ in range(n)]) > thr * SIG ** 2 for _ in range(R)) / R
    print(f"iid multipath s = {s_m:3.1f} sigma on all satellites: false alarms exact {chi2_sf_even(thr / (1 + s_m ** 2), n - 3):.4f} "
          f"simulated {fa:.4f}")
print("one satellite biased by b (no other noise change): mean statistic = (n-3) sigma^2 + b^2 (1 - 3/n)")
for b in (0.0, 3.0, 6.0):
    m = sum(residual_stat(az, [rng.gauss(0, SIG) + (b if i == 0 else 0.0) for i in range(n)]) for _ in range(R)) / R
    det = sum(residual_stat(az, [rng.gauss(0, SIG) + (b if i == 0 else 0.0) for i in range(n)]) > thr for _ in range(R)) / R
    pos = 2 * b / n
    print(f"b={b:3.1f}: mean stat {m:7.3f} (exact {(n - 3) * SIG ** 2 + b * b * (1 - 3 / n):7.3f}), detected {det:.3f}, horizontal bias {pos:.2f}")
