"""Milestone 6zc: how much wind-forecast skill do the buoy's own observations carry at 10 to 120 min?
6za/6zb left "a forecast with real skill at 15 minutes" as the open input. Here, on the NDBC 10-minute buoy series already in
experiments/data (19 buoy-months, Jan and Jul 2024), we score observation-only predictors of the next u, v wind against
persistence: a ridge-regularised linear autoregression on the last 6 samples (fit on January, tested on July, per buoy-pooled),
and a damped-trend rule. Metric: RMSE of the vector wind, and skill = 1 - RMSE/RMSE_persistence.
Run: python3 experiments/run_wind_nowcast_skill.py > experiments/results_wind_nowcast_skill.txt"""
import csv, glob, os, re
import numpy as np

LEADS = (1, 2, 3, 6, 12)   # in 10-minute steps: 10, 20, 30, 60, 120 min
NLAG = 6

def series(path):
    t, u, v = [], [], []
    for r in csv.DictReader(open(path)):
        try:
            s, d, m = float(r["speed"]), float(r["dir"]), float(r["t_min"])
        except ValueError:
            continue
        if s > 60 or d > 360:
            continue
        t.append(m); u.append(-s * np.sin(np.radians(d))); v.append(-s * np.cos(np.radians(d)))
    t = np.array(t)
    k = np.rint(t / 10).astype(int)
    n = k.max() + 1
    U = np.full(n, np.nan); V = np.full(n, np.nan)
    U[k], V[k] = u, v
    return U, V

def pairs(U, V, lead):
    """rows of (lags of u, lags of v) -> (u, v) at +lead; only fully observed rows."""
    X, Y, P = [], [], []
    for i in range(NLAG - 1, len(U) - lead):
        a, b = U[i - NLAG + 1:i + 1], V[i - NLAG + 1:i + 1]
        y = (U[i + lead], V[i + lead])
        if np.isnan(a).any() or np.isnan(b).any() or np.isnan(y[0]) or np.isnan(y[1]):
            continue
        X.append(np.concatenate([a, b])); Y.append(y); P.append((a[-1], b[-1]))
    return np.array(X), np.array(Y), np.array(P)

def stations(ym):
    out = {}
    for p in sorted(glob.glob(f"experiments/data/ndbc_wind_*_{ym}.csv")):
        out[re.search(r"wind_(\w+)_", p).group(1)] = series(p)
    return out

def main():
    jan, jul = stations("202401"), stations("202407")
    both = sorted(set(jan) & set(jul))
    print(f"buoys with both months: {len(both)} ({' '.join(both)}); lags {NLAG} x (u, v); 10-minute steps")
    for lead in LEADS:
        # per-buoy ridge AR on January residual-from-persistence, scored on July
        rm_p, rm_a, rm_t, n = [], [], [], 0
        per = []
        for st in both:
            Xa, Ya, Pa = pairs(*jan[st], lead)
            Xb, Yb, Pb = pairs(*jul[st], lead)
            if len(Xa) < 500 or len(Xb) < 500:
                continue
            lam = 10.0 * len(Xa) ** 0.5
            A = Xa.T @ Xa + lam * np.eye(Xa.shape[1])
            W = np.linalg.solve(A, Xa.T @ (Ya - Pa))     # learn the correction to persistence
            pred_ar = Pb + Xb @ W
            # damped trend: last value + 0.5 x mean 30-min slope x lead (rule, no fitting)
            sl = np.stack([(Xb[:, NLAG - 1] - Xb[:, NLAG - 4]) / 3, (Xb[:, 2 * NLAG - 1] - Xb[:, 2 * NLAG - 4]) / 3], axis=1)
            pred_tr = Pb + 0.5 * sl * lead
            e_p = np.sum((Yb - Pb) ** 2); e_a = np.sum((Yb - pred_ar) ** 2); e_t = np.sum((Yb - pred_tr) ** 2)
            per.append((st, len(Xb), np.sqrt(e_p / len(Xb) / 2), 1 - np.sqrt(e_a / e_p), 1 - np.sqrt(e_t / e_p)))
            rm_p.append(e_p); rm_a.append(e_a); rm_t.append(e_t); n += len(Xb)
        sk_a = [p[3] for p in per]; sk_t = [p[4] for p in per]
        print(f"\nlead {lead * 10:3d} min: {n} July test rows, {len(per)} buoys; persistence RMSE per component {np.sqrt(sum(rm_p) / n / 2):.2f} m/s")
        print(f"  ridge AR skill vs persistence : pooled {1 - np.sqrt(sum(rm_a) / sum(rm_p)):+.3f}; per-buoy median {np.median(sk_a):+.3f} (min {min(sk_a):+.3f}, max {max(sk_a):+.3f}); buoys > 0: {sum(s > 0 for s in sk_a)}/{len(per)}")
        print(f"  damped trend skill            : pooled {1 - np.sqrt(sum(rm_t) / sum(rm_p)):+.3f}; per-buoy median {np.median(sk_t):+.3f} (min {min(sk_t):+.3f}, max {max(sk_t):+.3f}); buoys > 0: {sum(s > 0 for s in sk_t)}/{len(per)}")

main()
