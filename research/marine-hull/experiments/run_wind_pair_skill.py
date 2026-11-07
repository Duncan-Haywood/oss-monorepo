"""Milestone 6zd: does a neighbouring station 15 to 70 km away add wind-forecast skill at 6 to 120 min?
6zc found a buoy's own past wind adds under 4% over persistence. Here a spatial predictor is tried on the CO-OPS 6-minute
series in experiments/data: ridge regression of the correction to persistence on 6 lags of (u, v) at the target station
alone ("self") and with 6 lags of (u, v) at a neighbour ("pair"). Pairs: San Francisco (9414290) and Alameda (9414750),
about 15 km, fitted on January and scored on July, both directions; Pensacola (8729840) and Dauphin Island (8735180),
about 70 km, July only (fit first 15 days, test the rest). Skill = 1 - RMSE/RMSE_persistence on the vector wind.
Run: python3 experiments/run_wind_pair_skill.py > experiments/results_wind_pair_skill.txt"""
import csv
import numpy as np

LEADS = (1, 2, 3, 5, 10, 20)   # 6-minute steps: 6, 12, 18, 30, 60, 120 min
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
    k = np.rint(np.array(t) / 6).astype(int)
    n = k.max() + 1
    U = np.full(n, np.nan); V = np.full(n, np.nan)
    U[k], V[k] = u, v
    return U, V

def rows(A, B, lead, lo=0, hi=None):
    """features: lags of target (u,v) [+ neighbour (u,v)]; target = target wind at +lead; rows in index range [lo, hi)."""
    (Ua, Va), (Ub, Vb) = A, B
    hi = len(Ua) if hi is None else min(hi, len(Ua))
    X, Y, P = [], [], []
    for i in range(max(lo, NLAG - 1), hi - lead):
        f = [Ua[i - NLAG + 1:i + 1], Va[i - NLAG + 1:i + 1], Ub[i - NLAG + 1:i + 1], Vb[i - NLAG + 1:i + 1]]
        y = (Ua[i + lead], Va[i + lead])
        if any(np.isnan(x).any() for x in f) or np.isnan(y).any():
            continue
        X.append(np.concatenate(f)); Y.append(y); P.append((f[0][-1], f[1][-1]))
    return np.array(X), np.array(Y), np.array(P)

def fit(X, Y, P, cols):
    lam = 10.0 * len(X) ** 0.5
    Xc = X[:, cols]
    return np.linalg.solve(Xc.T @ Xc + lam * np.eye(len(cols)), Xc.T @ (Y - P))

def score(name, trainA, trainB, testA, testB, split=None):
    own = list(range(0, 2 * NLAG)); both = list(range(0, 4 * NLAG))
    print(f"\n{name}")
    for lead in LEADS:
        if split is None:
            Xa, Ya, Pa = rows(trainA, trainB, lead); Xb, Yb, Pb = rows(testA, testB, lead)
        else:
            Xa, Ya, Pa = rows(trainA, trainB, lead, 0, split); Xb, Yb, Pb = rows(testA, testB, lead, split + 40)
        ep = np.sum((Yb - Pb) ** 2)
        out = []
        for cols in (own, both):
            W = fit(Xa, Ya, Pa, cols)
            e = np.sum((Yb - (Pb + Xb[:, cols] @ W)) ** 2)
            out.append(1 - np.sqrt(e / ep))
        print(f"  lead {lead * 6:3d} min: n={len(Xb):5d}, persistence RMSE/comp {np.sqrt(ep / len(Xb) / 2):.2f} m/s; skill self {out[0]:+.3f}, with neighbour {out[1]:+.3f}, neighbour adds {out[1] - out[0]:+.3f}")

def main():
    d = "experiments/data/coops_wind_"
    L = lambda s, m: series(f"{d}{s}_{m}.csv")
    sf1, sf7, al1, al7 = L("9414290", "202401"), L("9414290", "202407"), L("9414750", "202401"), L("9414750", "202407")
    score("San Francisco (target) with Alameda (neighbour, ~15 km): fit January, test July", sf1, al1, sf7, al7)
    score("Alameda (target) with San Francisco (neighbour, ~15 km): fit January, test July", al1, sf1, al7, sf7)
    pe, da = L("8729840", "202407"), L("8735180", "202407")
    n = min(len(pe[0]), len(da[0])); pe = (pe[0][:n], pe[1][:n]); da = (da[0][:n], da[1][:n])
    sp = n // 2
    score("Pensacola (target) with Dauphin Island (neighbour, ~70 km): July first half fit, second half test", pe, da, pe, da, sp)
    score("Dauphin Island (target) with Pensacola (neighbour, ~70 km): July first half fit, second half test", da, pe, da, pe, sp)

main()
