"""Milestone 6v: with the on-board heave-velocity law of 6u, U = s (Hs / T)^0.53, how far does a Wave Glider plan to go
per day at the programme's 2024 buoys, and is the plan still set more by the vehicle state than by the site?

Why: 6r planned km/day from U = s Hs^0.218, an exponent 6u showed was attenuated by matching the vehicle to a buoy up to
300 km away. With the vehicle's own Datawell MOSE waves, log u follows log(Hs / T_avg) with exponent a = 0.534 (6u H1,
post hoc, beating Hs alone by 1,430 BIC), and the free pair is b = 0.542 on Hs, c = -0.711 on T_avg (6u A3,
pre-registered). 6u's reading says 6r's rows "understate the spread between sites; they need rerunning with
(Hs/T)^0.53 before the paper quotes them". The 2024 buoy file already carries NDBC APD (average period) for every hour.

Rules (fixed before the first run; this docstring is committed before any output is read):
  Vehicle state: s_m = median over 6u's S2 hours of month m (from 2015-06-01, speed >= 0.1 m/s, MOSE Hs 0.2 to 10 m,
    T_avg > 0; months with >= 100 hours) of u / (Hs_ob / T_avg)^a. "best" = max s_m, "worst" = min s_m.
  Plan (primary, "ratio law"): at each 2024 buoy-month (January and July, >= 500 hours, as 6r), km/day =
    86.4 * mean over hours of s * (WVHT / APD)^a, a = 0.534.
  Free pair: the same with s'_m = median u / (Hs_ob^b T_avg^c) and km/day = 86.4 * mean s' * WVHT^b * APD^c.
  Transfer check: on S2 hours whose nearest buoy is <= 150 km away, k_H = median(Hs_ob / WVHT_buoy) and
    k_T = median(T_avg / APD_buoy) (MOSE "average period" and NDBC APD need not share a definition); the
    calibrated plan uses WVHT * k_H and APD * k_T.
  Coverage: the 5th and 95th percentiles of Hs_ob / T_avg over S2; per buoy-month the share of hours with
    WVHT / APD outside that range (the law is extrapolated there).
  6r's site ratio, state ratio and one-way variance shares (buoy x month x state grid) are recomputed the same way.
Predictions:
  P1  The site ratio (best over worst buoy, one month, one state) exceeds 6r's in both months (1.203 Jan, 1.335 Jul):
      the steeper exponent on heave velocity spreads the sites.
  P2  The state ratio lies in 1.4 to 1.9.
  P3  The between-state share of the variance in log km/day falls below 0.70 (6r 0.825).
  P4  At each of 42036, 42040 and 44013 in July (6r's slowest, Hs 0.40 to 0.46 m) more than 30% of hours lie below the
      mission's 5th percentile of Hs / T (the plan there is an extrapolation).
  P5  Every buoy-month at the best state stays below the 86 km/day solar ceiling (milestone 5c).
  P6  The calibrated transfer (k_H, k_T) moves each month's fleet median (best state) by under 10%.
  P7  The free pair and the ratio law give each month's fleet median (best state) within 5% of each other.

Run: python3 experiments/run_waveglider_site_period.py > experiments/results_waveglider_site_period.txt   (seconds,
stdlib, deterministic)"""
import csv
import math
import os
import statistics as st
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
D = os.path.join(HERE, "data") + os.sep

A = 0.534
B_FREE, C_FREE = 0.542, -0.711
SOLAR = 86.0
R6 = {1: 1.203, 7: 1.335}  # 6r site ratios
SLOW_JUL = ("42036", "42040", "44013")


def s2_rows():
    """6u's S2 hours with T_avg > 0, joined to the nearest-buoy match (for the transfer check)."""
    buoy = {r["hour"]: r for r in csv.DictReader(open(D + "waveglider_hourly.csv"))}
    out = []
    for r in csv.DictReader(open(D + "waveglider_onboard_hourly.csv")):
        if r["hour"] < "2015-06-01" or r["hs"] == "" or r["tavg"] == "":
            continue
        u, hs, t = float(r["speed"]), float(r["hs"]), float(r["tavg"])
        if u < 0.1 or not 0.2 <= hs <= 10 or t <= 0:
            continue
        b = buoy.get(r["hour"])
        out.append({"month": r["hour"][:7], "u": u, "hs": hs, "t": t,
                    "km": float(b["dist_km"]) if b and b["dist_km"] else None,
                    "hs_b": float(b["wvht"]) if b and b["wvht"] else None,
                    "apd_b": float(b["apd"]) if b and b["apd"] else None})
    return out


def ratio_g(hs, t):
    return (hs / t) ** A


def free_g(hs, t):
    return hs ** B_FREE * t ** C_FREE


def states(rows, g):
    by = {}
    for r in rows:
        by.setdefault(r["month"], []).append(r["u"] / g(r["hs"], r["t"]))
    return {m: st.median(v) for m, v in sorted(by.items()) if len(v) >= 100}


def buoy_hours():
    by = {}
    for x in csv.DictReader(open(D + "ndbc_waves_2024.csv")):
        by.setdefault((x["buoy"], int(x["month"])), []).append((float(x["wvht"]), float(x["apd"])))
    return {k: v for k, v in by.items() if len(v) >= 500}


def km_day(s, hours, g, kh=1.0, kt=1.0):
    return 86.4 * st.fmean(s * g(h * kh, t * kt) for h, t in hours)


def plan(rows, g, kh=1.0, kt=1.0):
    s = states(rows, g)
    best, worst = max(s.values()), min(s.values())
    tab = {k: (km_day(best, v, g, kh, kt), km_day(worst, v, g, kh, kt)) for k, v in buoy_hours().items()}
    return s, best, worst, tab


def fleet(tab, mon, j=0):
    return st.median(v[j] for k, v in tab.items() if k[1] == mon)


def shares(tab):
    cells = [(k[0], k[1], j, math.log(v[j])) for k, v in tab.items() for j in (0, 1)]
    mu = st.fmean(c[3] for c in cells)
    tot = sum((c[3] - mu) ** 2 for c in cells)

    def between(i):
        g = {}
        for c in cells:
            g.setdefault(c[i], []).append(c[3])
        return sum(len(v) * (st.fmean(v) - mu) ** 2 for v in g.values()) / tot

    return between(2), between(1), between(0)


def pct(v, q):
    v = sorted(v)
    i = q * (len(v) - 1)
    lo = int(i)
    return v[lo] + (v[min(lo + 1, len(v) - 1)] - v[lo]) * (i - lo)


def main():
    rows = s2_rows()
    print("Milestone 6v: 6r's km/day plan with the on-board heave-velocity law U = s (Hs/T)^a")
    print(f"{len(rows)} S2 hours (from 2015-06-01, MOSE Hs and T_avg); a = {A}; free pair b {B_FREE}, c {C_FREE}\n")

    s, best, worst, tab = plan(rows, ratio_g)
    print("vehicle-state index s_m = median u / (Hs_ob/T_avg)^a (m/s per (m/s)^a):")
    for m, v in s.items():
        print(f"  {m}  {v:.3f}")
    state = best / worst
    print(f"  best {best:.3f}, worst {worst:.3f}; state ratio {state:.3f} (6r 1.639, Hs^0.218, May included)\n")

    hb = buoy_hours()
    q = [r["hs"] / r["t"] for r in rows]
    lo, hi = pct(q, 0.05), pct(q, 0.95)
    print(f"mission Hs/T_avg (m/s): 5th pct {lo:.3f}, median {st.median(q):.3f}, 95th pct {hi:.3f}\n")

    print("2024 buoy-months: km/day best / worst state | median WVHT, APD, WVHT/APD | share of hours below / above "
          "the mission 5-95% Hs/T range")
    ok1 = ok5 = True
    site = {}
    below = {}
    for mon in (1, 7):
        keys = sorted(k for k in tab if k[1] == mon)
        for k in keys:
            kb, kw = tab[k]
            v = hb[k]
            r_ = [h / t for h, t in v]
            fb = sum(x < lo for x in r_) / len(r_)
            fa = sum(x > hi for x in r_) / len(r_)
            below[k] = fb
            print(f"  {mon:2d} {k[0]}  {kb:5.1f} {kw:5.1f} | {st.median(h for h, _ in v):.2f} m "
                  f"{st.median(t for _, t in v):5.2f} s {st.median(r_):.3f} | {fb:5.1%} {fa:5.1%}")
            ok5 = ok5 and kb < SOLAR
        kbs = [tab[k][0] for k in keys]
        site[mon] = max(kbs) / min(kbs)
        print(f"  month {mon}: {len(keys)} buoys, fleet median {fleet(tab, mon):.1f} (best) / {fleet(tab, mon, 1):.1f} "
              f"(worst) km/day; site ratio {site[mon]:.3f} (6r {R6[mon]:.3f}) against state ratio {state:.3f}")
        ok1 = ok1 and site[mon] > R6[mon]
    sh = shares(tab)
    print(f"\nvariance of log km/day over buoy x month x state: between states {sh[0]:.3f}, months {sh[1]:.3f}, "
          f"buoys {sh[2]:.3f} (6r 0.825 / 0.058 / 0.106; one-way shares)\n")

    near = [r for r in rows if r["km"] is not None and r["km"] <= 150 and r["hs_b"] and r["apd_b"]]
    kh = st.median(r["hs"] / r["hs_b"] for r in near)
    kt = st.median(r["t"] / r["apd_b"] for r in near)
    print(f"transfer check on {len(near)} S2 hours with the buoy <= 150 km: k_H = median Hs_ob/WVHT {kh:.3f}, "
          f"k_T = median T_avg/APD {kt:.3f}")
    _, _, _, tc = plan(rows, ratio_g, kh, kt)
    _, bf, wf, tf = plan(rows, free_g)
    sf = states(rows, free_g)
    print("  free-pair state index: " + ", ".join(f"{m} {v:.3f}" for m, v in sf.items())
          + f"; state ratio {bf / wf:.3f}")
    ok6 = ok7 = True
    for mon in (1, 7):
        base = fleet(tab, mon)
        dc = fleet(tc, mon) / base - 1
        df = fleet(tf, mon) / base - 1
        print(f"  month {mon}: fleet median (best) ratio law {base:.1f}, calibrated {fleet(tc, mon):.1f} ({dc:+.1%}), "
              f"free pair {fleet(tf, mon):.1f} ({df:+.1%}); free-pair site ratio "
              f"{max(v[0] for k, v in tf.items() if k[1] == mon) / min(v[0] for k, v in tf.items() if k[1] == mon):.3f}")
        ok6 = ok6 and abs(dc) < 0.10
        ok7 = ok7 and abs(df) < 0.05
    shf = shares(tf)
    print(f"  free pair variance shares: states {shf[0]:.3f}, months {shf[1]:.3f}, buoys {shf[2]:.3f}\n")

    print(f"P1 site ratio above 6r's in both months ({site[1]:.3f} vs 1.203, {site[7]:.3f} vs 1.335): "
          f"{'held' if ok1 else 'refuted'}")
    print(f"P2 state ratio {state:.3f} in 1.4 to 1.9: {'held' if 1.4 <= state <= 1.9 else 'refuted'}")
    print(f"P3 between-state share {sh[0]:.3f} below 0.70: {'held' if sh[0] < 0.70 else 'refuted'}")
    ok4 = all(below[(b, 7)] > 0.30 for b in SLOW_JUL)
    print("P4 July " + ", ".join(f"{b} {below[(b, 7)]:.1%}" for b in SLOW_JUL)
          + f" of hours below the mission 5th pct, all > 30%: {'held' if ok4 else 'refuted'}")
    print(f"P5 every buoy-month below {SOLAR:.0f} km/day at the best state: {'held' if ok5 else 'refuted'}")
    print(f"P6 calibrated transfer moves fleet medians under 10%: {'held' if ok6 else 'refuted'}")
    print(f"P7 free pair within 5% of the ratio law: {'held' if ok7 else 'refuted'}")


def edge_check(rows, g, s):
    """Post hoc (added after reading P1 to P7): does the law hold at the low end of the mission's Hs/T range, where
    the July Gulf and Nantucket plans sit? Median of observed u / (s_m g) by Hs/T bin; 1.0 means the law is unbiased."""
    out = []
    edges = (0.0, 0.12, 0.15, 0.184, 0.25, 0.32, 0.40, 0.475, 9.0)
    for a0, b0 in zip(edges, edges[1:]):
        v = [r["u"] / (s[r["month"]] * g(r["hs"], r["t"])) for r in rows
             if a0 <= r["hs"] / r["t"] < b0 and r["month"] in s]
        out.append((a0, b0, len(v), st.median(v) if v else None))
    return out


def post_hoc(rows):
    print("\nPost hoc (written after reading P1 to P7; exploratory): law residual by mission Hs/T bin, "
          "median u / (s_m (Hs/T)^a)")
    s = states(rows, ratio_g)
    for a0, b0, n, m in edge_check(rows, ratio_g, s):
        print(f"  Hs/T {a0:.3f} to {b0:.3f}: {n:5d} hours" + (f", median ratio {m:.3f}" if m is not None else ""))


if __name__ == "__main__":
    main()
    post_hoc(s2_rows())
