import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from quantized_reports import *
from quantized_reports.model import optimal_density

DIVS = {"brier": brier_div, "log": log_div}
M = 40000

print("E1: mean regret vs N (uniform prior). uniform-midpoint grid vs optimal compander vs prediction")
qs = prior_quantiles("uniform", M)
print(f"{'div':6}{'N':>6}{'uniform*N^2':>14}{'optimal*N^2':>14}{'pred*N^2':>12}")
for dn in ("brier", "log"):
    for N in (16, 64, 256, 1024):
        ru = mean_regret(uniform_grid(N), DIVS[dn], qs)
        ro = mean_regret(compander_grid(N, optimal_density(dn, "uniform"), 200000), DIVS[dn], qs)
        pr = predicted_regret(N, dn, "uniform", 100000)
        print(f"{dn:6}{N:6}{ru*N*N:14.5f}{ro*N*N:14.5f}{pr*N*N:12.5f}")

print("\nE2: same, arcsine (confident) prior")
qs = prior_quantiles("arcsine", M)
for dn in ("brier", "log"):
    for N in (16, 64, 256, 1024):
        ru = mean_regret(uniform_grid(N), DIVS[dn], qs)
        ro = mean_regret(compander_grid(N, optimal_density(dn, "arcsine"), 200000), DIVS[dn], qs)
        pr = predicted_regret(N, dn, "arcsine", 100000)
        print(f"{dn:6}{N:6}{ru*N*N:14.5f}{ro*N*N:14.5f}{pr*N*N:12.5f}")

print("\nE3: minifloat formats (uniform prior, log score): raw vs symmetrised, vs uniform grid with same #points")
qs = prior_quantiles("uniform", M)
print(f"{'fmt':10}{'#pts':>6}{'raw':>12}{'symm':>12}{'uniform N':>12}{'opt N':>12}")
for name, e, m in (("e4m3", 4, 3), ("e5m2", 5, 2), ("e3m4", 3, 4), ("e5m6", 5, 6)):
    g = minifloat_grid(e, m)
    gs = symmetrized(g)
    N = len(gs)
    print(f"{name:10}{len(g):6}{mean_regret(g, log_div, qs):12.3e}{mean_regret(gs, log_div, qs):12.3e}"
          f"{mean_regret(uniform_grid(N), log_div, qs):12.3e}"
          f"{mean_regret(compander_grid(N, optimal_density('log','uniform'), 200000), log_div, qs):12.3e}")
print("\nE3b: same under Brier")
for name, e, m in (("e4m3", 4, 3), ("e5m2", 5, 2), ("e3m4", 3, 4), ("e5m6", 5, 6)):
    g = minifloat_grid(e, m); gs = symmetrized(g); N = len(gs)
    print(f"{name:10}{len(g):6}{mean_regret(g, brier_div, qs):12.3e}{mean_regret(gs, brier_div, qs):12.3e}"
          f"{mean_regret(uniform_grid(N), brier_div, qs):12.3e}")

print("\nE4: argmin_r KL(q||r) is not the nearest grid point (log score, N=8 uniform grid)")
g = sorted(uniform_grid(8)); bad = 0; tot = 0
for i in range(1, 2000):
    q = i / 2000
    near = min(g, key=lambda r: abs(r - q))
    best = min(g, key=lambda r: log_div(q, r))
    tot += 1; bad += near != best
print(f"fraction of q where best report != nearest: {bad/tot:.3f}")
