"""Milestone 6q: once the Wave Glider's slow drift (6p's post-hoc, about 30% between July and August) is carried by a
vehicle-state term, does sea state add forecast skill, and does a time-since-launch trend extrapolate?

Why: 6p found the one-parameter foil model and a power law in Hs both lose to a constant on held-out hours, and that a
months-long drift hides the sea-state response in pooled data. A mission planner forecasting distance made good needs
to know which carries the signal: the vehicle's own recent speed (fouling, mode, whatever it is), the sea state, or a
trend in time. Same data as 6p (experiments/data/waveglider_hourly.csv, from experiments/fetch_waveglider.py).

Rules (fixed before the first run):
  Target hours: speed >= 0.1 m/s, buoy distance <= 300 km, hour >= 2015-08-01 (6p's test set). Forecast origin
  t0 = target - h for horizons h in {6, 24, 72} h. Trailing window: hours in [t0 - 24 h, t0) with speed >= 0.1 m/s at
  any buoy distance (vehicle speed through water does not depend on the buoy); a target is scored only if the window
  holds >= 6 hours, at every horizon, so all models are scored on the same hours per horizon.
  M0  constant: median speed of the training hours (< 2015-08-01, <= 300 km), as 6p.
  M1  persistence of vehicle state: median speed over the trailing window.
  M2  M1 x (Hs_target / median Hs over the trailing window) ^ b, Hs from the matched buoy (an oracle sea-state forecast:
      the observed target-hour buoy Hs stands in for a wave forecast, which flatters M2), b = the within-month
      exponent: OLS of log speed on log Hs with one intercept per calendar month, training hours only.
  M3  time trend: OLS of log speed on log Hs and days since the first hour (2015-05-20), training hours only,
      extrapolated to the target hour.
Predictions:
  P1  At h = 24 h, M1's MAE <= 0.85 x M0's.
  P2  At h = 24 h, M2's MAE <= 0.95 x M1's (sea state adds information once vehicle state is carried).
  P3  M3's MAE > M0's at h = 24 h (the May to July trend points the wrong way for Aug to Oct).
  P4  The training within-month exponent b lies in 0.2 to 0.6 (sub-linear; the quasi-steady model says 1).
  P5  M1's skill over M0 (1 - MAE1/MAE0) falls monotonically with horizon over 6, 24, 72 h.
Also reported (descriptive): b fitted on all hours, the 150 km cut, and a block bootstrap (1-day blocks, 2,000
resamples, seed 1) interval on MAE2/MAE1 and MAE1/MAE0 at 24 h.

Run: python3 experiments/run_waveglider_drift.py > experiments/results_waveglider_drift.txt   (a few seconds)"""
import csv
import math
import random
import statistics as st
from datetime import datetime, timedelta

D = "experiments/data/"
T0 = datetime(2015, 5, 20)
SPLIT = datetime(2015, 8, 1)


def load():
    rows = []
    for r in csv.DictReader(open(D + "waveglider_hourly.csv")):
        u = float(r["speed"])
        if u < 0.1:
            continue
        rows.append({"t": datetime.strptime(r["hour"], "%Y-%m-%dT%H"), "u": u, "hs": float(r["wvht"]),
                     "km": float(r["dist_km"])})
    return rows


def ols(X, y):
    """Least squares by normal equations (small p), Gaussian elimination."""
    p = len(X[0])
    A = [[sum(x[i] * x[j] for x in X) for j in range(p)] for i in range(p)]
    b = [sum(x[i] * yy for x, yy in zip(X, y)) for i in range(p)]
    for c in range(p):
        piv = max(range(c, p), key=lambda r: abs(A[r][c]))
        A[c], A[piv], b[c], b[piv] = A[piv], A[c], b[piv], b[c]
        for r in range(p):
            if r != c and A[c][c] != 0:
                f = A[r][c] / A[c][c]
                A[r] = [a - f * cc for a, cc in zip(A[r], A[c])]
                b[r] -= f * b[c]
    return [b[i] / A[i][i] for i in range(p)]


def within_month_b(rows):
    months = sorted({r["t"].month for r in rows})
    X = [[1.0 if r["t"].month == m else 0.0 for m in months] + [math.log(r["hs"])] for r in rows]
    return ols(X, [math.log(r["u"]) for r in rows])[-1]


def trend_fit(rows):
    X = [[1.0, math.log(r["hs"]), (r["t"] - T0).total_seconds() / 86400] for r in rows]
    return ols(X, [math.log(r["u"]) for r in rows])


def scored(rows, max_km, horizons):
    by_t = {r["t"]: r for r in rows}
    out = {h: [] for h in horizons}
    targets = [r for r in rows if r["t"] >= SPLIT and r["km"] <= max_km]
    for r in targets:
        wins = {}
        for h in horizons:
            t0 = r["t"] - timedelta(hours=h)
            w = [by_t[t0 - timedelta(hours=k)] for k in range(1, 25) if (t0 - timedelta(hours=k)) in by_t]
            if len(w) < 6:
                break
            wins[h] = w
        else:
            for h in horizons:
                out[h].append((r, wins[h]))
    return out


def run(rows, max_km, label, boot=False):
    train = [r for r in rows if r["t"] < SPLIT and r["km"] <= max_km]
    c = st.median(r["u"] for r in train)
    b = within_month_b(train)
    a3, b3, g3 = trend_fit(train)
    horizons = (6, 24, 72)
    sc = scored(rows, max_km, horizons)
    print(f"{label}: {len(train)} training hours; M0 constant {c:.3f} m/s; within-month b {b:.3f}; "
          f"M3 log u = {a3:.3f} + {b3:.3f} log Hs + {g3:+.5f} day")
    print("  h   n    MAE M0   M1     M2     M3    | M1/M0  M2/M1  M3/M0 | skill M1 over M0")
    res = {}
    for h in horizons:
        e = {k: [] for k in ("m0", "m1", "m2", "m3")}
        for r, w in sc[h]:
            u1 = st.median(x["u"] for x in w)
            hw = st.median(x["hs"] for x in w)
            day = (r["t"] - T0).total_seconds() / 86400
            pred = {"m0": c, "m1": u1, "m2": u1 * (r["hs"] / hw) ** b,
                    "m3": math.exp(a3 + b3 * math.log(r["hs"]) + g3 * day)}
            for k in e:
                e[k].append(abs(pred[k] - r["u"]))
        m = {k: st.fmean(v) for k, v in e.items()}
        res[h] = (m, e, [r for r, _ in sc[h]])
        print(f"  {h:2d} {len(sc[h]):4d}  {m['m0']:.3f}  {m['m1']:.3f}  {m['m2']:.3f}  {m['m3']:.3f} | "
              f"{m['m1'] / m['m0']:.3f}  {m['m2'] / m['m1']:.3f}  {m['m3'] / m['m0']:.3f} | {1 - m['m1'] / m['m0']:+.3f}")
    if boot:
        m, e, rs = res[24]
        days = sorted({r["t"].date() for r in rs})
        idx = {d: [i for i, r in enumerate(rs) if r["t"].date() == d] for d in days}
        rng = random.Random(1)
        q21, q10 = [], []
        for _ in range(2000):
            ii = [i for d in rng.choices(days, k=len(days)) for i in idx[d]]
            s = {k: sum(e[k][i] for i in ii) for k in ("m0", "m1", "m2")}
            q21.append(s["m2"] / s["m1"])
            q10.append(s["m1"] / s["m0"])
        q21.sort()
        q10.sort()
        print(f"  block bootstrap (1-day blocks, {len(days)} days, 2,000 resamples) at 24 h: "
              f"M2/M1 95% {q21[50]:.3f} to {q21[1949]:.3f}; M1/M0 95% {q10[50]:.3f} to {q10[1949]:.3f}")
    return b, res


def main():
    rows = load()
    b, res = run(rows, 300.0, "<= 300 km (pre-registered)", boot=True)
    m6, m24, m72 = (res[h][0] for h in (6, 24, 72))
    print()
    ok1 = m24["m1"] <= 0.85 * m24["m0"]
    print(f"P1 M1/M0 at 24 h = {m24['m1'] / m24['m0']:.3f}: {'held' if ok1 else 'refuted'} (<= 0.85)")
    ok2 = m24["m2"] <= 0.95 * m24["m1"]
    print(f"P2 M2/M1 at 24 h = {m24['m2'] / m24['m1']:.3f}: {'held' if ok2 else 'refuted'} (<= 0.95)")
    ok3 = m24["m3"] > m24["m0"]
    print(f"P3 M3/M0 at 24 h = {m24['m3'] / m24['m0']:.3f}: {'held' if ok3 else 'refuted'} (> 1)")
    ok4 = 0.2 <= b <= 0.6
    print(f"P4 within-month b (training) = {b:.3f}: {'held' if ok4 else 'refuted'} (0.2 to 0.6)")
    sk = [1 - m["m1"] / m["m0"] for m in (m6, m24, m72)]
    ok5 = sk[0] > sk[1] > sk[2]
    print(f"P5 M1 skill at 6/24/72 h = {sk[0]:+.3f} / {sk[1]:+.3f} / {sk[2]:+.3f}: "
          f"{'held' if ok5 else 'refuted'} (strictly falling)")
    print("\nDescriptive:")
    print(f"  within-month b on all hours <= 300 km: {within_month_b([r for r in rows if r['km'] <= 300]):.3f}; "
          f"all distances: {within_month_b(rows):.3f}")
    run(rows, 150.0, "  <= 150 km")


if __name__ == "__main__":
    main()
