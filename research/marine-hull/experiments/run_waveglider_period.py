"""Milestone 6s: at a fixed vehicle state, does wave period change a Wave Glider's speed, and does a period term give
back part of the Pacific buoys' lead in 6r's km/day plan?

Why: 6p's P2 found that at fixed wave height a longer dominant period goes with lower speed (residual against DPD
-0.260), but that was pooled over the mission, where 6p also found a 30% vehicle drift. 6q then fitted the height
exponent at a fixed vehicle state (month intercepts, b = 0.218) with no period term, and 6r planned km/day at the 2024
buoys from Hs alone. 6r's Pacific buoys (46011, 46013, 46026, 46054) gave the most distance; they also have the
longest-period swell. If period slows the vehicle at fixed state and height, 6r overstated the site spread.
Same data as 6p to 6r: experiments/data/waveglider_hourly.csv (2015 MAGI mission, matched NDBC buoy WVHT and DPD) and
experiments/data/ndbc_waves_2024.csv (hourly WVHT and DPD at the 2024 buoys).

Rules (fixed before the first run):
  Fit hours: speed >= 0.1 m/s, buoy distance <= 300 km, hour < 2015-08-01 (6q's training set).
  F1  log u = month intercepts + b log Hs                  (6q's fit; must give b = 0.218).
  F2  log u = month intercepts + b2 log Hs + c log DPD     (the period term at fixed vehicle state).
  Interval on c: block bootstrap over days of the fit hours (1-day blocks, 2,000 resamples, seed 1), 2.5/97.5%.
  Forecast test (6q's held-out hours and windows, run_waveglider_drift.scored, <= 300 km, 6/24/72 h):
    M2   = M1 x (Hs / Hs_w)^b                               (6q's oracle sea-state forecast)
    M2c  = M1 x (Hs / Hs_w)^b2 x (DPD / DPD_w)^c            (the same with the period term; _w = trailing medians)
  Site plan (6r's rules with the period term): s_m = median over the month's hours (speed >= 0.1, any distance,
  months >= 100 h) of u / (Hs^b2 DPD^c); km/day = 86.4 x mean over the buoy-month's hours of s Hs^b2 DPD^c, at
  the best and worst s_m; 2024 buoy-months with >= 500 hours, January and July, as 6r.
  Pacific lead = mean over the Pacific buoys (46xxx) present that month of km/day / that month's fleet median, at
  the best state; compared with the same figure from 6r's Hs-only plan.
Predictions:
  P1  c < 0 and its bootstrap 95% interval excludes 0.
  P2  b2 > b (holding period fixed raises the height exponent, since height and period rise together).
  P3  At 24 h M2c's MAE is at least 0.97 x M2's (the period term adds no measurable forecast skill, as Hs did not in 6q).
  P4  The Pacific lead is smaller with the period term than in 6r, in both January and July.
  P5  The site ratio (max / min buoy km/day in a month) stays below the state ratio (best / worst s_m) in both months.
Also reported (descriptive): c on all hours <= 300 km and at any distance, the per-buoy table against 6r, the
bootstrap interval on M2c/M2 at 24 h, and the fleet medians against 6r.

Run: python3 experiments/run_waveglider_period.py > experiments/results_waveglider_period.txt   (a few seconds, stdlib)"""
import csv
import math
import os
import random
import statistics as st
import sys
from datetime import datetime

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import run_waveglider_drift as dr  # noqa: E402
import run_waveglider_site as rs  # noqa: E402

D = os.path.join(HERE, "data") + os.sep
SPLIT = dr.SPLIT


def load():
    rows = []
    for r in csv.DictReader(open(D + "waveglider_hourly.csv")):
        u = float(r["speed"])
        if u < 0.1:
            continue
        rows.append({"t": datetime.strptime(r["hour"], "%Y-%m-%dT%H"), "u": u, "hs": float(r["wvht"]),
                     "tp": float(r["dpd"]), "km": float(r["dist_km"])})
    return rows


def fit(rows, period=True):
    """Month intercepts + b log Hs (+ c log DPD). Returns (b, c) with c = 0.0 when period is False."""
    months = sorted({r["t"].month for r in rows})
    X = [[1.0 if r["t"].month == m else 0.0 for m in months] + [math.log(r["hs"])]
         + ([math.log(r["tp"])] if period else []) for r in rows]
    beta = dr.ols(X, [math.log(r["u"]) for r in rows])
    return (beta[-2], beta[-1]) if period else (beta[-1], 0.0)


def boot_c(rows, n=2000, seed=1):
    days = sorted({r["t"].date() for r in rows})
    by = {d: [r for r in rows if r["t"].date() == d] for d in days}
    rng = random.Random(seed)
    cs = sorted(fit([r for d in rng.choices(days, k=len(days)) for r in by[d]])[1] for _ in range(n))
    return cs[int(0.025 * n)], cs[int(0.975 * n) - 1]


def states(rows_any, b, c):
    by = {}
    for r in rows_any:
        by.setdefault(r["t"].strftime("%Y-%m"), []).append(r["u"] / (r["hs"] ** b * r["tp"] ** c))
    return {m: st.median(v) for m, v in sorted(by.items()) if len(v) >= 100}


def buoy_hours():
    by = {}
    for x in csv.DictReader(open(D + "ndbc_waves_2024.csv")):
        by.setdefault((x["buoy"], int(x["month"])), []).append((float(x["wvht"]), float(x["dpd"])))
    return {k: v for k, v in by.items() if len(v) >= 500}


def km_day(s, hours, b, c):
    return 86.4 * st.fmean(s * h ** b * t ** c for h, t in hours)


def plan(rows_any, b, c):
    s = states(rows_any, b, c)
    best, worst = max(s.values()), min(s.values())
    return s, best, worst, {k: (km_day(best, v, b, c), km_day(worst, v, b, c)) for k, v in buoy_hours().items()}


def pacific_lead(tab, mon):
    ks = [v[0] for k, v in tab.items() if k[1] == mon]
    pac = [v[0] for k, v in tab.items() if k[1] == mon and k[0].startswith("46")]
    return st.fmean(pac) / st.median(ks)


def main():
    rows = load()
    train = [r for r in rows if r["t"] < SPLIT and r["km"] <= 300]
    b, _ = fit(train, period=False)
    b2, c = fit(train)
    lo, hi = boot_c(train)
    print(f"Fit hours: {len(train)} (< 2015-08-01, <= 300 km, speed >= 0.1 m/s)")
    print(f"  F1 month intercepts + b log Hs:              b = {b:.3f}")
    print(f"  F2 month intercepts + b2 log Hs + c log DPD: b2 = {b2:.3f}, c = {c:.3f} "
          f"(1-day block bootstrap 95% {lo:.3f} to {hi:.3f})")
    near = [r for r in rows if r["km"] <= 300]
    print(f"  descriptive: F2 on all hours <= 300 km b2 = {fit(near)[0]:.3f}, c = {fit(near)[1]:.3f}; "
          f"any distance b2 = {fit(rows)[0]:.3f}, c = {fit(rows)[1]:.3f}")

    print("\nForecast test (6q's held-out hours, <= 300 km): MAE m/s")
    sc = dr.scored(rows, 300.0, (6, 24, 72))
    print("  h   n    M1     M2     M2c   | M2c/M2")
    e24 = None
    for h in (6, 24, 72):
        e1, e2, e3 = [], [], []
        for r, w in sc[h]:
            u1 = st.median(x["u"] for x in w)
            hw = st.median(x["hs"] for x in w)
            tw = st.median(x["tp"] for x in w)
            e1.append(abs(u1 - r["u"]))
            e2.append(abs(u1 * (r["hs"] / hw) ** b - r["u"]))
            e3.append(abs(u1 * (r["hs"] / hw) ** b2 * (r["tp"] / tw) ** c - r["u"]))
        m1, m2, m3 = st.fmean(e1), st.fmean(e2), st.fmean(e3)
        print(f"  {h:2d} {len(sc[h]):4d}  {m1:.3f}  {m2:.3f}  {m3:.3f} | {m3 / m2:.3f}")
        if h == 24:
            e24 = (e2, e3, [r for r, _ in sc[h]], m2, m3)
    e2, e3, rr, m2, m3 = e24
    days = sorted({r["t"].date() for r in rr})
    idx = {d: [i for i, r in enumerate(rr) if r["t"].date() == d] for d in days}
    rng = random.Random(1)
    q = sorted(sum(e3[i] for i in ii) / sum(e2[i] for i in ii)
               for ii in ([i for d in rng.choices(days, k=len(days)) for i in idx[d]] for _ in range(2000)))
    print(f"  24 h M2c/M2 block bootstrap ({len(days)} days, 2,000 resamples) 95% {q[50]:.3f} to {q[1949]:.3f}")

    print("\nSite plan at the 2024 buoys (km/day at the best state: 6r Hs-only | 6s with period; median DPD s)")
    s6r, best6r, worst6r, tab6r = rs.plan(rs.B)
    s, best, worst, tab = plan(rows, b2, c)
    hrs = buoy_hours()
    print("  state index s_m: " + ", ".join(f"{m[5:]} {v:.3f}" for m, v in s.items())
          + f"; state ratio {best / worst:.3f} (6r {best6r / worst6r:.3f})")
    ok5 = True
    for mon in (1, 7):
        for k in sorted(k for k in tab if k[1] == mon):
            print(f"  {mon:2d} {k[0]}  {tab6r[k][0]:5.1f} | {tab[k][0]:5.1f}  "
                  f"({tab[k][0] / tab6r[k][0] - 1:+.1%}); DPD {st.median(t for _, t in hrs[k]):.1f}")
        kb = [v[0] for k, v in tab.items() if k[1] == mon]
        kb6 = [v[0] for k, v in tab6r.items() if k[1] == mon]
        kw = [v[1] for k, v in tab.items() if k[1] == mon]
        site = max(kb) / min(kb)
        ok5 = ok5 and site < best / worst
        print(f"  month {mon}: fleet median best {st.median(kb):.1f} (6r {st.median(kb6):.1f}), worst "
              f"{st.median(kw):.1f}; site ratio {site:.3f} (6r {max(kb6) / min(kb6):.3f})")
    lead = {m: (pacific_lead(tab6r, m), pacific_lead(tab, m)) for m in (1, 7)}
    for m, (a, z) in lead.items():
        print(f"  Pacific lead, month {m}: 6r {a:.3f} -> 6s {z:.3f}")

    print()
    ok1 = c < 0 and hi < 0
    print(f"P1 c = {c:.3f}, 95% {lo:.3f} to {hi:.3f}: {'held' if ok1 else 'refuted'} (c < 0, interval excludes 0)")
    print(f"P2 b2 = {b2:.3f} against b = {b:.3f}: {'held' if b2 > b else 'refuted'} (b2 > b)")
    print(f"P3 M2c/M2 at 24 h = {m3 / m2:.3f}: {'held' if m3 / m2 >= 0.97 else 'refuted'} (>= 0.97)")
    ok4 = all(z < a for a, z in lead.values())
    print(f"P4 Pacific lead smaller than 6r in both months: {'held' if ok4 else 'refuted'}")
    print(f"P5 site ratio < state ratio in both months: {'held' if ok5 else 'refuted'}")


if __name__ == "__main__":
    main()
