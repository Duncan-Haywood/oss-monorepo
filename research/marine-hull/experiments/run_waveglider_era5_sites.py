"""Milestone 6x: with ERA5 in place of a buoy, does a Wave Glider's planned km/day transfer to the 2024 buoy sites, and
what does the same plan say for open ocean where there is no buoy?

Why: 6w found ERA5 (0.5 degree reanalysis, swh and mwp) at the vehicle's position keeps 6u's law U = s (Hs/T)^a with
the same exponent (a_e 0.533 against 0.534 on board) and the same monthly km/day, so "6v's law can be planned anywhere
ERA5 covers, not only at buoys". That was checked only where the vehicle sailed (open Hawaiian seas). 6v's plan at the
2024 NDBC buoys used the buoy's own WVHT and APD. This run (a) replaces the buoy with ERA5 at each buoy's grid point
and compares the two plans, which tests the transfer at coastal and shelf sites a 0.5 degree model resolves worst, and
(b) plans the same vehicle over a 10 degree open-ocean grid and at the programme's five corridor sites
(experiments/fetch_era5_sites.py).

Rules (fixed before the first run; this docstring is committed before the 2024 ERA5 data is fetched):
  Vehicle (ERA5 side, 6w's hours and rules): a_e = exponent of log u ~ month + a log(Hs_e/Tm_e) on 6w's analysis hours;
    s_m = median u / (Hs_e/Tm_e)^a_e per 2015 month with >= 100 hours; best = max s_m, worst = min s_m.
  ERA5 plan: km/day = 86.4 x s x mean over the month's hours of (hs/tm)^a_e. Buoy plan: 6v's ratio-law table
    (experiments/run_waveglider_site_period.py, on-board state, buoy WVHT/APD, a = 0.534), best state unless said.
  Buoy-months: the 22 of 6v (11 buoys, January and July 2024) that have ERA5 hours.
  Grid: 10 degree points from 70 S to 70 N with >= 600 ERA5 hours in the month; the mean over hours of q^a is taken
    as the mean over the 20 stored equal-mass quantiles of q (checked against the exact mean on the site files).
  Coverage: the share of hours with q_e outside the 5th to 95th percentile of q_e over 6w's analysis hours (grid:
    the share of the 20 quantile bins outside it).
Predictions:
  P1  The median of ERA5 plan / buoy plan over the buoy-months lies in 0.90 to 1.10.
  P2  At least 80% of buoy-months have ERA5 plan within 15% of the buoy plan.
  P3  The Spearman rank correlation of the buoys' plans (ERA5 against buoy) is >= 0.7 in each month.
  P4  The ERA5 site ratio (best over worst buoy, best state) is within 0.25 of 6v's in each month (1.123 Jan,
      1.725 Jul).
  P5  The mean |log(ERA5 / buoy)| is larger over the five shelf and Gulf buoy-months in July (41009, 42036, 42040,
      44013, 44025) than over the other 17 buoy-months.
  P6  At the best state, under 10% of ocean grid points plan above the 86 km/day solar ceiling (milestone 5c) in each
      month.
  P7  The grid point with the highest plan lies north of 30 N in January and south of 30 S in July (winter seas).
  P8  Pooled over grid points and both months, more than 30% of hours lie outside the mission's 5 to 95% q_e range.
  P9  Florida-Straits plans the least of the five corridor sites in both months.

Run (from research/marine-hull): python3 experiments/run_waveglider_era5_sites.py >
  experiments/results_waveglider_era5_sites.txt   (seconds, stdlib, deterministic)"""
import csv
import math
import os
import statistics as st
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import run_waveglider_era5 as e  # noqa: E402
import run_waveglider_onboard as o  # noqa: E402
import run_waveglider_site_period as v  # noqa: E402

D = os.path.join(HERE, "data") + os.sep
SOLAR = 86.0
R6V = {1: 1.123, 7: 1.725}
SHELF_JUL = ("41009", "42036", "42040", "44013", "44025")
CORRIDOR = ("Equator-Pacific", "Florida-Straits", "Gulf-of-Maine", "North-Sea", "Gulf-of-Alaska")


def vehicle():
    """a_e, monthly state index s_m and the 5-95% range of q_e, on 6w's analysis hours."""
    S = e.hours(e.load())
    a = o.fit(S, [e.Q_E])[0]
    by = {}
    for r in S:
        by.setdefault(r["t"].month, []).append(r["u"] / math.exp(a * e.Q_E(r)))
    s = {m: st.median(x) for m, x in sorted(by.items()) if len(x) >= 100}
    q = [r["hs_e"] / r["tm_e"] for r in S]
    return a, s, (v.pct(q, 0.05), v.pct(q, 0.95))


def sites():
    out = {}
    for r in csv.DictReader(open(D + "era5_sites_2024.csv")):
        k = (r["site"], int(r["month"]))
        out.setdefault(k, {"kind": r["kind"], "lat": float(r["lat"]), "lon": float(r["lon"]), "h": []})
        out[k]["h"].append((r["hour"], float(r["hs"]), float(r["tm"])))
    return out


def grid():
    return [{"lat": float(r["lat"]), "lon": float(r["lon"]), "month": int(r["month"]), "n": int(r["n"]),
             "hs": float(r["hs_med"]), "tm": float(r["tm_med"]), "q": [float(r[f"q{j + 1:02d}"]) for j in range(20)]}
            for r in csv.DictReader(open(D + "era5_grid_2024.csv"))]


def km_exact(s, a, hours):
    return 86.4 * s * st.fmean((hs / tm) ** a for _, hs, tm in hours)


def km_quant(s, a, q):
    return 86.4 * s * st.fmean(x ** a for x in q)


def ranks(x):
    order = sorted(range(len(x)), key=lambda i: x[i])
    r = [0.0] * len(x)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and x[order[j + 1]] == x[order[i]]:
            j += 1
        for k in range(i, j + 1):
            r[order[k]] = (i + j) / 2 + 1
        i = j + 1
    return r


def spearman(x, y):
    rx, ry = ranks(x), ranks(y)
    mx, my = st.fmean(rx), st.fmean(ry)
    c = sum((a - mx) * (b - my) for a, b in zip(rx, ry))
    return c / math.sqrt(sum((a - mx) ** 2 for a in rx) * sum((b - my) ** 2 for b in ry))


def quantiles(vals, k=20):
    vals = sorted(vals)
    out = []
    for j in range(k):
        x = (j + 0.5) / k * (len(vals) - 1)
        lo = int(x)
        out.append(vals[lo] + (vals[min(lo + 1, len(vals) - 1)] - vals[lo]) * (x - lo))
    return out


def main():
    a, s, (qlo, qhi) = vehicle()
    best, worst = max(s.values()), min(s.values())
    print("Milestone 6x: Wave Glider km/day planned from ERA5 at the 2024 buoys, an open-ocean grid and the corridor sites")
    print(f"vehicle (6w hours, ERA5 swh/mwp): a_e {a:.3f}; s_m " + ", ".join(f"{m}: {x:.3f}" for m, x in s.items())
          + f"; best {best:.3f}, worst {worst:.3f}, state ratio {best / worst:.3f}")
    print(f"mission q_e = Hs_e/Tm_e 5th to 95th percentile: {qlo:.3f} to {qhi:.3f} m/s\n")

    st6v = v.plan(v.s2_rows(), v.ratio_g)[3]
    bh = v.buoy_hours()
    raw = {}
    for x in csv.DictReader(open(D + "ndbc_waves_2024.csv")):
        raw[(x["buoy"], x["hour"])] = (float(x["wvht"]), float(x["apd"]))
    S = sites()

    print("A  buoys: ERA5 plan against 6v's buoy plan (best state), km/day; ERA5 grid point; hour-matched medians of "
          "ERA5/buoy Hs and Tm/APD; share of ERA5 hours below / above the mission q_e range")
    lr = {}
    for mon in (1, 7):
        for k in sorted(kk for kk in st6v if kk[1] == mon):
            z = S.get(k)
            if not z:
                print(f"  {mon:2d} {k[0]}  no ERA5")
                continue
            ke = km_exact(best, a, z["h"])
            kb = st6v[k][0]
            lr[k] = (ke, kb)
            mh = [(hs / raw[(k[0], t)][0], tm / raw[(k[0], t)][1]) for t, hs, tm in z["h"]
                  if (k[0], t) in raw and raw[(k[0], t)][0] > 0 and raw[(k[0], t)][1] > 0]
            qq = [hs / tm for _, hs, tm in z["h"]]
            print(f"  {mon:2d} {k[0]}  ERA5 {ke:5.1f}  buoy {kb:5.1f}  ratio {ke / kb:.3f} | ({z['lat']:.1f}, "
                  f"{z['lon']:.1f}) | Hs {st.median(x[0] for x in mh):.3f}  T {st.median(x[1] for x in mh):.3f} "
                  f"({len(mh)} h) | {sum(x < qlo for x in qq) / len(qq):5.1%} {sum(x > qhi for x in qq) / len(qq):5.1%}")
    ratios = [ke / kb for ke, kb in lr.values()]
    med = st.median(ratios)
    within = sum(abs(r - 1) <= 0.15 for r in ratios) / len(ratios)
    print(f"  {len(ratios)} buoy-months: median ratio {med:.3f}; within 15%: {within:.1%}; range {min(ratios):.3f} to "
          f"{max(ratios):.3f}")
    rho, site = {}, {}
    for mon in (1, 7):
        ks = [k for k in lr if k[1] == mon]
        rho[mon] = spearman([lr[k][0] for k in ks], [lr[k][1] for k in ks])
        site[mon] = max(lr[k][0] for k in ks) / min(lr[k][0] for k in ks)
        fe = st.median(lr[k][0] for k in ks)
        fb = st.median(lr[k][1] for k in ks)
        print(f"  month {mon}: Spearman {rho[mon]:.3f}; ERA5 site ratio {site[mon]:.3f} (6v {R6V[mon]:.3f}); fleet "
              f"median ERA5 {fe:.1f} against buoy {fb:.1f} km/day (best state), {fe * worst / best:.1f} at the worst")
    shelf = [abs(math.log(lr[(b, 7)][0] / lr[(b, 7)][1])) for b in SHELF_JUL if (b, 7) in lr]
    other = [abs(math.log(x[0] / x[1])) for k, x in lr.items() if not (k[1] == 7 and k[0] in SHELF_JUL)]
    print(f"  mean |log ratio|: July shelf and Gulf {st.fmean(shelf):.3f} ({len(shelf)}), others {st.fmean(other):.3f} "
          f"({len(other)})\n")

    print("B  corridor sites (programme milestone 5), km/day best / worst state; ERA5 grid point; median Hs, Tm; "
          "share of hours below / above the mission q_e range")
    cor = {}
    for mon in (1, 7):
        for name in CORRIDOR:
            z = S.get((name, mon))
            if not z:
                print(f"  {mon:2d} {name:16s} no ERA5")
                continue
            kb = km_exact(best, a, z["h"])
            cor[(name, mon)] = kb
            qq = [hs / tm for _, hs, tm in z["h"]]
            print(f"  {mon:2d} {name:16s} {kb:5.1f} {km_exact(worst, a, z['h']):5.1f} | ({z['lat']:.1f}, {z['lon']:.1f}) "
                  f"| {st.median(h for _, h, _ in z['h']):.2f} m {st.median(t for _, _, t in z['h']):5.2f} s | "
                  f"{sum(x < qlo for x in qq) / len(qq):5.1%} {sum(x > qhi for x in qq) / len(qq):5.1%}")
    err = max(abs(km_quant(best, a, quantiles([hs / tm for _, hs, tm in z["h"]])) / km_exact(best, a, z["h"]) - 1)
              for z in S.values())
    print(f"  quantile approximation (20 equal-mass bins) against the exact mean over all {len(S)} site-months: "
          f"max error {err:.2%}\n")

    G = grid()
    print("C  10 degree open-ocean grid, best state")
    above, top, outs = {}, {}, []
    for mon in (1, 7):
        g = [x for x in G if x["month"] == mon]
        km = [(km_quant(best, a, x["q"]), x) for x in g]
        above[mon] = sum(k > SOLAR for k, _ in km) / len(km)
        top[mon] = max(km, key=lambda t: t[0])
        lo_ = min(km, key=lambda t: t[0])
        out = [sum(q < qlo or q > qhi for q in x["q"]) / 20 for x in g]
        outs += out
        ks = sorted(k for k, _ in km)
        print(f"  month {mon}: {len(g)} ocean points; km/day 10th / median / 90th {v.pct(ks, 0.1):.1f} / "
              f"{st.median(ks):.1f} / {v.pct(ks, 0.9):.1f}; above {SOLAR:.0f}: {above[mon]:.1%}; max {top[mon][0]:.1f} at "
              f"({top[mon][1]['lat']:.0f}, {top[mon][1]['lon']:.0f}); min {lo_[0]:.1f} at ({lo_[1]['lat']:.0f}, "
              f"{lo_[1]['lon']:.0f}); median share outside the mission q_e range {st.median(out):.0%}")
        for band in ((-70, -40), (-40, -10), (-10, 10), (10, 40), (40, 70)):
            b = [k for k, x in km if band[0] <= x["lat"] <= band[1]]
            if b:
                print(f"    lat {band[0]:4d} to {band[1]:3d}: {len(b):3d} points, median {st.median(b):5.1f} km/day "
                      f"(worst state {st.median(b) * worst / best:5.1f})")
    pooled = st.fmean(outs)
    print(f"  pooled share of grid hours outside the mission q_e range: {pooled:.1%}\n")

    print(f"P1 median ERA5/buoy ratio {med:.3f} in 0.90 to 1.10: {'held' if 0.9 <= med <= 1.1 else 'refuted'}")
    print(f"P2 {within:.1%} of buoy-months within 15% (>= 80%): {'held' if within >= 0.8 else 'refuted'}")
    print(f"P3 Spearman {rho[1]:.3f} (Jan), {rho[7]:.3f} (Jul), both >= 0.7: "
          f"{'held' if min(rho.values()) >= 0.7 else 'refuted'}")
    ok4 = all(abs(site[m] - R6V[m]) <= 0.25 for m in (1, 7))
    print(f"P4 site ratios {site[1]:.3f} / {site[7]:.3f} within 0.25 of 1.123 / 1.725: {'held' if ok4 else 'refuted'}")
    print(f"P5 July shelf |log ratio| {st.fmean(shelf):.3f} > others {st.fmean(other):.3f}: "
          f"{'held' if st.fmean(shelf) > st.fmean(other) else 'refuted'}")
    print(f"P6 grid share above {SOLAR:.0f} km/day {above[1]:.1%} (Jan), {above[7]:.1%} (Jul), both < 10%: "
          f"{'held' if max(above.values()) < 0.10 else 'refuted'}")
    ok7 = top[1][1]["lat"] > 30 and top[7][1]["lat"] < -30
    print(f"P7 max point at {top[1][1]['lat']:.0f} (Jan), {top[7][1]['lat']:.0f} (Jul): {'held' if ok7 else 'refuted'}")
    print(f"P8 pooled share outside the mission range {pooled:.1%} > 30%: {'held' if pooled > 0.30 else 'refuted'}")
    ok9 = all(min((cor[(n, m)], n) for n in CORRIDOR if (n, m) in cor)[1] == "Florida-Straits" for m in (1, 7))
    print(f"P9 Florida-Straits lowest of the corridor sites in both months: {'held' if ok9 else 'refuted'}")


def implied_ratio(hs_ratio, t_ratio, a, cal_h, cal_t):
    """ERA5/buoy plan ratio implied by hour-matched median Hs and period ratios at a site, once the vehicle-side
    calibration (ERA5 against the on-board sensor, which 6v found matches buoy WVHT and APD) is divided out."""
    return ((hs_ratio / cal_h) / (t_ratio / cal_t)) ** a


def post_hoc():
    """Written after reading P1 to P9 (exploratory). Where does the +10% come from? The vehicle state s was fitted on
    ERA5 (Hs_e/Tm_e) at the vehicle, where median Tm_e/T_avg was 1.285 and Hs_e/Hs_ob 0.960 (6w A1); if ERA5's ratios
    to the buoys differ from those, the plan shifts by the implied ratio. Also: the plan with ERA5 Hs and period
    rescaled by those site ratios, and ranks with the buoys' own ratios."""
    a, s, _ = vehicle()
    best = max(s.values())
    S0 = e.hours(e.load())
    cal_h = st.median(r["hs_e"] / r["hs"] for r in S0)
    cal_t = st.median(r["tm_e"] / r["tavg"] for r in S0)
    st6v = v.plan(v.s2_rows(), v.ratio_g)[3]
    raw = {}
    for x in csv.DictReader(open(D + "ndbc_waves_2024.csv")):
        raw[(x["buoy"], x["hour"])] = (float(x["wvht"]), float(x["apd"]))
    print("\nPost hoc (written after reading P1 to P9; exploratory)")
    print(f"  vehicle-side calibration (6w hours): Hs_e/Hs_ob {cal_h:.3f}, Tm_e/T_avg {cal_t:.3f}")
    obs, imp = [], []
    for k, z in sorted(sites().items()):
        if k not in st6v:
            continue
        m = [(hs / raw[(k[0], t)][0], tm / raw[(k[0], t)][1]) for t, hs, tm in z["h"]
             if (k[0], t) in raw and raw[(k[0], t)][0] > 0 and raw[(k[0], t)][1] > 0]
        obs.append(math.log(km_exact(best, a, z["h"]) / st6v[k][0]))
        imp.append(math.log(implied_ratio(st.median(x[0] for x in m), st.median(x[1] for x in m), a, cal_h, cal_t)))
    mo, mi = st.fmean(obs), st.fmean(imp)
    c = sum((x - mo) * (y - mi) for x, y in zip(obs, imp))
    r_ = c / math.sqrt(sum((x - mo) ** 2 for x in obs) * sum((y - mi) ** 2 for y in imp))
    res = [x - y for x, y in zip(obs, imp)]
    print(f"  {len(obs)} buoy-months: mean log ratio observed {mo:+.3f} (x{math.exp(mo):.3f}), implied by the median "
          f"Hs and period ratios {mi:+.3f} (x{math.exp(mi):.3f}); correlation {r_:.3f}; residual sd "
          f"{st.pstdev(res):.3f} against {st.pstdev(obs):.3f} raw")
    tr = []
    for k, z in sites().items():
        if k in st6v:
            tr += [tm / raw[(k[0], t)][1] for t, _, tm in z["h"] if (k[0], t) in raw and raw[(k[0], t)][1] > 0]
    print(f"  median Tm_e/APD at the buoys {st.median(tr):.3f} over all matched hours (vehicle side {cal_t:.3f}; 6v's k_T MOSE/APD 0.988)")


if __name__ == "__main__":
    main()
    post_hoc()
