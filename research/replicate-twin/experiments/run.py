"""Replicate-twin experiments.  Exact tables (E1-E3) come from closed forms; E2b and E4 are Monte Carlo checks."""
import math, random, sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from replicate_twin import *

RS = [1, 2, 5, 10, 20, 50]
RS_CI = RS[1:]   # an interval needs r >= 2


def e1(N, phi, delta):
    print(f"\nE1  exact MSE of the grand mean, N={N}, phi={phi}, delta={delta} (d = MSE-optimal per r)")
    m1 = best_d(N, 1, phi, delta)[1]
    print("  r    n    d*    bias      MSE        MSE/MSE(r=1)   MSE if d=0")
    for r in RS:
        d, m = best_d(N, r, phi, delta)
        print(f"  {r:<4}{N//r:<6}{d:<6}{ar1_bias(N//r, phi, delta, d):<10.4f}{m:<11.5f}{m/m1:<15.3f}{rep_mse(N, r, phi, delta, 0):.5f}")


def e2(N, phi, delta):
    print(f"\nE2  exact coverage of the nominal-95% t interval at the MSE-optimal d, N={N}, phi={phi}, delta={delta}")
    print("  r    d*    coverage   half-width")
    for r in RS_CI:
        d, _ = best_d(N, r, phi, delta)
        print(f"  {r:<4}{d:<6}{coverage(N, r, phi, delta, d):<11.4f}{half_width(N, r, phi, d):.4f}")


def e2b(N, phi, delta, rs, reps, seed=1):
    print(f"\nE2b Monte Carlo check of E2 (AR(1), {reps} macro-runs), N={N}, phi={phi}, delta={delta}")
    rng = random.Random(seed)
    print("  r    d*    exact cov   simulated cov")
    for r in rs:
        n = N // r
        d, _ = best_d(N, r, phi, delta)
        t = t_quant(0.975, r - 1)
        hit = 0
        for _ in range(reps):
            m, h = rep_ci([sum(ar1_from(phi, n, rng, delta)[d:]) / (n - d) for _ in range(r)], t)
            hit += abs(m) <= h
        print(f"  {r:<4}{d:<6}{coverage(N, r, phi, delta, d):<12.4f}{hit/reps:.4f}")


def e3(N, phi, delta):
    print(f"\nE3  smallest d with exact coverage >= 0.94 and its cost, N={N}, phi={phi}, delta={delta}")
    print("  r    d_valid  d_MSE   half-width   MSE(d_valid)   MSE-opt(r=1)")
    m1 = best_d(N, 1, phi, delta)[1]
    for r in RS_CI:
        dv = min_d_valid(N, r, phi, delta)
        if dv is None:
            print(f"  {r:<4}none"); continue
        dm, _ = best_d(N, r, phi, delta)
        print(f"  {r:<4}{dv:<9}{dm:<8}{half_width(N, r, phi, dv):<13.4f}{rep_mse(N, r, phi, delta, dv):<15.5f}{m1:.5f}")


def e3b(N, phi, delta, reps, seed=2):
    """Single-run batch means (30 batches) at the MSE-optimal d for r=1, versus replication with a valid d."""
    print(f"\nE3b single-run batch-means (30 batches) coverage by simulation, N={N}, phi={phi}, delta={delta}, {reps} runs")
    rng = random.Random(seed)
    t = t_quant(0.975, 29)
    d1, _ = best_d(N, 1, phi, delta)
    for d in (0, d1, 3 * d1):
        hit, w = 0, 0.0
        for _ in range(reps):
            m, h = batch_ci(ar1_from(phi, N, rng, delta)[d:], t)
            hit += abs(m) <= h; w += h
        print(f"  d={d:<5} coverage {hit/reps:.4f}  mean half-width {w/reps:.4f}")


def e4(rho, N, reps, seed=3):
    print(f"\nE4  M/M/1 empty start, rho={rho}, N={N} jobs, true mean wait {mm1_wait_mean(rho):.3f}, {reps} macro-runs (simulation)")
    rng = random.Random(seed)
    mu = mm1_wait_mean(rho)
    print("  r    d     bias      RMSE     coverage  half-width")
    for r in (1, 10, 30):
        n = N // r
        ds = (0, 100, 300) if r < 30 else (0, 50, 100)
        acc = {d: [0.0, 0.0, 0, 0.0] for d in ds}
        t = t_quant(0.975, (r if r > 1 else 30) - 1)
        for _ in range(reps):
            runs = [mm1_waits(rho, n, rng) for _ in range(r)]
            for d in ds:
                if r == 1:
                    m, h = batch_ci(runs[0][d:], t)
                else:
                    m, h = rep_ci([sum(x[d:]) / (n - d) for x in runs], t)
                a = acc[d]
                a[0] += m - mu; a[1] += (m - mu) ** 2; a[2] += abs(m - mu) <= h; a[3] += h
        for d in ds:
            a = acc[d]
            print(f"  {r:<4}{d:<6}{a[0]/reps:<10.4f}{math.sqrt(a[1]/reps):<9.4f}{a[2]/reps:<10.4f}{a[3]/reps:.4f}")


if __name__ == "__main__":
    for phi, delta in ((0.9, 3.0), (0.99, 3.0)):
        e1(20000, phi, delta)
    e2(2000, 0.9, 3.0); e2(20000, 0.9, 3.0); e2(20000, 0.99, 3.0)
    e2b(2000, 0.9, 3.0, (5, 20, 50), 4000)
    e3(2000, 0.9, 3.0); e3(20000, 0.9, 3.0); e3(20000, 0.99, 3.0)
    e3b(2000, 0.9, 3.0, 1500)
    e4(0.9, 6000, 500)
