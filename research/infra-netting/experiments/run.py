"""Experiments for infra-netting. Deterministic (seeded).   PYTHONPATH=src python experiments/run.py > experiments/results.txt"""
import random
import statistics as st
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from infra_netting import *  # noqa: E402

# Published reference, Bech and Soramaki (2001): participants and payments per day (section 4.2), the share of value
# the three largest banks send or receive (about half in DK, almost two thirds in FI), and Table 1 averages.
SYS = {"DK": dict(n=146, pays=925, top3=0.50, lb=10.7, ub=37.2), "FI": dict(n=13, pays=1428, top3=0.66, lb=4.3, ub=27.4)}
FIT = {"DK": (2.0, 0.8), "FI": (2.0, 0.9)}   # (sigma, rho) chosen from section A against Table 1
ALPHAS = (0.0, 0.2, 0.4, 0.6, 0.8, 1.0)       # the paper's six liquidity levels


def calibrate(n, top3):
    lo, hi = 0.0, 4.0
    for _ in range(40):
        m = (lo + hi) / 2
        if top_share(bank_weights(n, m), 3) < top3:
            lo = m
        else:
            hi = m
    return (lo + hi) / 2


def days(name, sigma, rho, n_days, seed=1):
    c = SYS[name]
    s = calibrate(c["n"], c["top3"])
    rng = random.Random(seed)
    return [gen_day(rng, c["n"], c["pays"], s, sigma, rho) for _ in range(n_days)], c


def ratios(ds, n):
    out = []
    for p in ds:
        ub, lb, g = bounds(p, n)
        out.append((100 * ub / g, 100 * lb / g, 100 * bilateral_need(p, n) / g))
    return [st.mean(x) for x in zip(*out)]


def bank_bounds(p, n):
    bal, peak = [0.0] * n, [0.0] * n
    for _, i, j, v in p:
        bal[i] -= v
        bal[j] += v
        peak[i] = max(peak[i], -bal[i])
    return [max(0.0, -b) for b in bal], peak


def tradeoff(name, n_days):
    sigma, rho = FIT[name]
    ds, c = days(name, sigma, rho, n_days)
    n = c["n"]
    print("alpha delay_fifo delay_res cut_pct unsettled_fifo unsettled_res alg_share")
    for a in ALPHAS:
        rows = []
        for p in ds:
            lb, ub = bank_bounds(p, n)
            liq = [lb[i] + a * (ub[i] - lb[i]) for i in range(n)]
            d0, u0, _ = simulate(p, n, liq, False)
            d1, u1, al = simulate(p, n, liq, True)
            rows.append((d0, d1, u0, u1, al))
        m = [st.mean(x) for x in zip(*rows)]
        cut = 100 * (1 - m[1] / m[0]) if m[0] > 1e-6 else float("nan")
        print(f"{a} {m[0]:.4f} {m[1]:.4f} {cut:.1f} {m[2]:.4f} {m[3]:.4f} {m[4]:.4f}")


print("== A. Bounds as percent of gross value, mean of 60 simulated days, against Table 1 of the paper")
print("system sigma rho | UB LB bilateral | published UB LB")
for name in SYS:
    for sigma in (1.0, 2.0, 3.0):
        for rho in (0.0, 0.5, 0.8, 0.9, 1.0):
            ds, c = days(name, sigma, rho, 60)
            ub, lb, bi = ratios(ds, c["n"])
            mark = " <- used" if FIT[name] == (sigma, rho) else ""
            print(f"{name} {sigma} {rho} | {ub:.1f} {lb:.1f} {bi:.1f} | {c['ub']} {c['lb']}{mark}")

print("== B. Netting at the fitted settings: percent of gross value that must be funded")
print("system gross bilateral multilateral(LB) queue-free(UB)")
for name in SYS:
    ds, c = days(name, *FIT[name], 60)
    ub, lb, bi = ratios(ds, c["n"])
    print(f"{name} 100.0 {bi:.1f} {lb:.1f} {ub:.1f}")

print("== C. Delay against liquidity, DK shape (20 days), liquidity = LB + alpha (UB - LB) per bank; paper: delay cut up to 50 percent at low liquidity")
tradeoff("DK", 20)
print("== D. Delay against liquidity, FI shape (20 days); paper: a considerably more modest cut, about 10 percent at low to moderate liquidity")
tradeoff("FI", 20)

print("== E. Does the DK result depend on the size spread? sigma sweep at rho 0.8, alpha 0.2 (20 days)")
print("sigma delay_fifo delay_res cut_pct")
for sigma in (1.0, 2.0, 3.0):
    ds, c = days("DK", sigma, 0.8, 20)
    n = c["n"]
    r = []
    for p in ds:
        lb, ub = bank_bounds(p, n)
        liq = [lb[i] + 0.2 * (ub[i] - lb[i]) for i in range(n)]
        r.append((simulate(p, n, liq, False)[0], simulate(p, n, liq, True)[0]))
    m = [st.mean(x) for x in zip(*r)]
    print(f"{sigma} {m[0]:.4f} {m[1]:.4f} {100 * (1 - m[1] / m[0]):.1f}")
