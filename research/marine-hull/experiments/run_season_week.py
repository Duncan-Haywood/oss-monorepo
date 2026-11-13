"""Milestone 6zs: for a small pack under a heavy payload, does a power estimate that keeps the climatology's season
and the trailing mean's week cover the trailing-mean rule's distance?

Why: 6zr's "Next". With the station-keeping gate dropped (6zr: theta 0 is never worse than 0.75 by more than
0.0011 x B km), the climatology speed rule (K) still covers only 0.928 and 0.962 x the 7-day trailing-mean rule's
(L = B) distance at 50 W with 2.5 and 5 kWh packs, while (K) holds station about as often as (L). 6zr's untested
reading: (L) moves on the sunny weeks inside a dull season, which climatology averages away; a small pack cannot carry
the boat through a below-payload season on the pack feedback alone, so what is left is *when* it spends. If so, an
estimate that keeps (K)'s season and lets a sunny week through should recover the distance at small packs without
giving up (K)'s payload uptime at large ones.

Data: as 6zk to 6zr (NASA POWER daily ALLSKY_SFC_SW_DWN, public domain; experiments/data/). No new data.

Estimators (f(d) in W; h the vehicle's own past daily harvest, hc the strict-history climatology, both Wh/day):
  K     hc(d) / 24                                   (6zo's)
  L     mean(h[d-7:d]) / 24                          (6zn's trailing mean; the baseline's estimate)
  M     max(K, L)                                    (season as a floor, a sunny week lifts it)
  Ba    a L + (1 - a) K for a in {0.25, 0.5, 0.75}   (linear blends B25, B50, B75)
  KA7   hc(d) x clip(sum h[d-7:d] / sum hc[d-7:d], 0.5, 1.5) / 24   (season scaled by the last week's anomaly; 6zo's
        KA used 30 days)
Inputs swept (not sourced as single figures): 6zp's 12 configurations (packs 2.5, 5, 10, 20 kWh x hotel 10, 30,
50 W); tau in {10, 20, 30, 60} days.

Rules (fixed in this docstring and committed before any configuration below was run):
  Boat, harvest, daily step, launch full on 1 January, the 30 points x 2015 to 2024, the target
  T = lead(max(0.5 C, Rc), 45 days) and the speed rule are 6zr's, with the gate dropped (theta = 0) for every
  grid variant, as 6zr recommended:
    p = f(d) + (SOC - T(d)) / (tau 24)      (speed 0 whenever p <= hotel)
  Grid G: {K, L, M, B25, B50, B75, KA7} x tau {10, 20, 30, 60} (28 variants), theta 0.
  Baseline B = (L, 10, theta 1): 6zp's to 6zr's reference, unchanged.
  "K pick" = rule S over the (K, tau, theta 0) column (6zr's recommended design; a test checks this column against
  6zr's `score`).
  Split T only (strict history): select on 2015 to 2019, each year's climatology from the other years of 2015 to
  2019; score on 2020 to 2024 with the 2015 to 2019 climatology. Excess dark hours against the idle vehicle of the
  same configuration.
  Selection rule S (6zo to 6zr's): among G variants whose summed selection-set excess dark hours are at most B's, the
  most summed km; if none qualifies, the fewest excess dark hours. "pick" = rule S over G.
Predictions:
  P1  At 50 W the pick dominates B on test (km >= B's, excess dark hours <= B's) at at least 3 of the 4 packs
      (6zr: 2 of 4).
  P2  At 50 W with 2.5 and 5 kWh, the pick's test km / B is at least 0.98 at both (6zr: 0.928 and 0.962).
  P3  At 50 W with 2.5 and 5 kWh, the pick's estimator is not K (the week is selected where the pack is small).
  P4  Where the deck carries the payload the week adds little: at 10 and 30 W, the pick's test km / B is within
      0.005 of the K pick's or above it in all 8 cells, and its test excess dark hours are at most 1.2 x the K pick's
      in at least 6 of 8.
  P5  Mechanism: at 2.5 kWh / 50 W on the test set, M at the K pick's tau moves (speed > 0) on a share of point-days
      at least 0.05 above the K pick's share.
Descriptive (no prediction): per configuration, the full test-set grid (km / B, excess / B, moving share); the
  best-on-test variant.

Run (from research/marine-hull): PYTHONPATH=src python3 experiments/run_season_week.py > experiments/results_season_week.txt
(stdlib, deterministic; uses up to 4 processes)"""
import os
import statistics as st
import sys
from functools import lru_cache
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import run_hotel_gate as hg  # noqa: E402
import run_pack_hotel_tau as pt  # noqa: E402
import run_reserve_curve as rc  # noqa: E402
import run_wave_vs_sun_sites as y  # noqa: E402
import run_year_pack as yp  # noqa: E402

CONFIGS = pt.CONFIGS
PACKS, HOTELS = pt.PACKS, pt.HOTELS
ESTS = ("K", "L", "M", "B25", "B50", "B75", "KA7")
TAUS = (10, 20, 30, 60)
GRID = tuple((e, t, 0.0) for e in ESTS for t in TAUS)
GK = tuple(g for g in GRID if g[0] == "K")
BASE = ("L", 10, 1.0)
TRAIN, TEST, YEARS = pt.TRAIN, pt.TEST, pt.YEARS
WEEK = 7
CLIP = (0.5, 1.5)


def estimate(est, h, hc, d, hotel):
    """f(d) in W for estimator `est` from past harvest h[:d] and climatology hc (Wh/day)."""
    k = hc[d] / 24.0
    past = h[max(0, d - WEEK):d]
    lw = st.fmean(past) / 24.0 if past else hotel
    if est == "K":
        return k
    if est == "L":
        return lw
    if est == "M":
        return max(k, lw)
    if est in ("B25", "B50", "B75"):
        a = int(est[1:]) / 100.0
        return a * lw + (1.0 - a) * k
    if est == "KA7":
        den = sum(hc[max(0, d - WEEK):d])
        r = sum(past) / den if past and den > 0 else 1.0
        return k * min(CLIP[1], max(CLIP[0], r))
    raise ValueError(est)


def run(sun, T, hc, est, tau, theta, cap, hotel):
    """6zr's run_gate with a pluggable estimate: dict km, down, dark, moved (days with speed > 0)."""
    h = [yp.harvest_wh(k) for k in sun]
    hd = hotel * 24.0
    soc, km, down, dark, moved = cap, 0.0, 0, 0.0, 0
    for d, e in enumerate(h):
        f = estimate(est, h, hc, d, hotel)
        p = hotel if f < theta * hotel else f + (soc - T[d]) / (tau * 24.0)
        avail = soc + e
        if avail < hd:
            soc = 0.0
            down += 1
            dark += (hd - avail) / hotel
            continue
        v = yp.speed_for_power(p, hotel)
        if avail - yp.load_w(v, hotel) * 24.0 < 0:
            v = y.bisect(lambda x: avail - yp.load_w(x, hotel) * 24.0 >= 0) or 0.0
        soc = min(cap, avail - yp.load_w(v, hotel) * 24.0)
        km += 86.4 * v
        moved += v > 0
    return {"km": km, "down": down, "dark": dark, "moved": moved}


@lru_cache(maxsize=None)
def _clim(p, yr):
    return tuple(rc.climatology_wh(p, yr, years=TRAIN))


def score(key):
    """((cap, hotel, point, year), {variant: (km, excess dark h, moving days)})."""
    cap, hotel, p, yr = key
    sun = rc.year_sun(p, yr)
    hc = list(_clim(p, yr))
    T = pt.target(hc, cap, hotel)
    idle_dark = yp.idle(sun, cap, hotel)[1]
    out = {}
    for est, tau, th in (BASE,) + GRID:
        r = run(sun, T, hc, est, tau, th, cap, hotel)
        out[(est, tau, th)] = (r["km"], r["dark"] - idle_dark, r["moved"])
    return key, out


total = hg.total


def select(tot, grid=GRID):
    """Rule S over `grid` with B as the reference."""
    b_ex = tot[BASE][1]
    ok = [g for g in grid if tot[g][1] <= b_ex]
    if ok:
        return max(ok, key=lambda g: tot[g][0])
    return min(grid, key=lambda g: tot[g][1])


def evaluate(configs=CONFIGS, points=None, procs=4):
    pts = points or yp.points()
    keys = [(c, h, p, yr) for c, h in configs for p in pts for yr in YEARS]
    with Pool(procs) as pool:
        return dict(pool.map(score, keys, chunksize=5))


def summarise(cells, configs=CONFIGS, points=None):
    pts = points or yp.points()
    out = {}
    for c, h in configs:
        sk = [(c, h, p, yr) for p in pts for yr in TRAIN]
        tk = [(c, h, p, yr) for p in pts for yr in TEST]
        sel, test = total(cells, sk), total(cells, tk)
        out[(c, h)] = {"sel": sel, "test": test, "pick": select(sel), "pk": select(sel, GK),
                       "best_test": select(test)}
    return out


ratio = hg.ratio


def main():
    cells = evaluate()
    S = summarise(cells)
    nd = sum(len(rc.year_sun(p, yr)) for p in yp.points() for yr in TEST)
    print("Milestone 6zs: power estimates that keep the climatology's season and the trailing mean's week")
    print(f"packs {[int(c) for c in PACKS]} Wh x hotel {[int(h) for h in HOTELS]} W; grid {ESTS} x tau {TAUS}, "
          f"gate theta 0; B = {BASE}; target lead 45 days; split T (select 2015-2019, test 2020-2024); "
          f"{nd} test point-days per configuration")

    for (c, h), s in S.items():
        sel, test = s["sel"], s["test"]
        b, bs = test[BASE], sel[BASE]
        print(f"\nC {c / 1000:.1f} kWh, hotel {h:.0f} W (storage D = {pt.storage_days(c, h):.1f} days)")
        print(f"   selection: B km {bs[0]:.0f}, excess dark h {bs[1]:.0f}; pick {s['pick'][:2]}; K pick "
              f"{s['pk'][:2]}; best-on-test {s['best_test'][:2]}")
        print(f"   test: B km {b[0]:.0f}, excess dark h {b[1]:.0f}, B moving share {b[2] / nd:.3f}")
        print("     est  tau | sel km/B | sel ex/B | test km/B | test excess | test ex/B | moving share")
        for g in GRID:
            t, q = test[g], sel[g]
            print(f"     {g[0]:4s} {g[1]:3d} | {q[0] / bs[0]:8.4f} | {ratio(q[1], bs[1]):8.3f} | {t[0] / b[0]:9.4f} | "
                  f"{t[1]:11.0f} | {ratio(t[1], b[1]):9.3f} | {t[2] / nd:12.3f}")

    print("\nSummary (test set 2020-2024; picks made on 2015-2019)")
    print("   C kWh  hotel W | pick       | pick km/B  ex/B  move | K pick tau  km/B  ex/B  move |   gain | best-test")
    for (c, h), s in S.items():
        t, b = s["test"], s["test"][BASE]
        k, q = t[s["pick"]], t[s["pk"]]
        print(f"   {c / 1000:5.1f}  {h:7.0f} | {s['pick'][0]:4s} {s['pick'][1]:3d}   | {k[0] / b[0]:9.4f} "
              f"{ratio(k[1], b[1]):5.3f} {k[2] / nd:5.3f} | {s['pk'][1]:10d} {q[0] / b[0]:5.4f} {ratio(q[1], b[1]):5.3f} "
              f"{q[2] / nd:5.3f} | {(k[0] - q[0]) / b[0]:+.4f} | {s['best_test'][:2]}")

    print("\nPredictions")
    h50 = [S[(c, 50.0)] for c in PACKS]
    dom = [c for c, s in zip(PACKS, h50)
           if s["test"][s["pick"]][0] >= s["test"][BASE][0] and s["test"][s["pick"]][1] <= s["test"][BASE][1]]
    print(f"P1 at 50 W the pick dominates B on test at >= 3 of 4 packs: {'held' if len(dom) >= 3 else 'refuted'} "
          f"({len(dom)} of 4: {[c / 1000 for c in dom]} kWh)")
    small = [S[(c, 50.0)] for c in PACKS[:2]]
    r2 = [s["test"][s["pick"]][0] / s["test"][BASE][0] for s in small]
    print(f"P2 at 50 W, 2.5 and 5 kWh, pick test km / B >= 0.98: {'held' if all(x >= 0.98 for x in r2) else 'refuted'} "
          f"({', '.join(f'{x:.4f}' for x in r2)})")
    e3 = [s["pick"][0] for s in small]
    print(f"P3 at 50 W, 2.5 and 5 kWh, pick estimator is not K: {'held' if 'K' not in e3 else 'refuted'} ({e3})")
    d4, x4 = [], []
    for c in PACKS:
        for h in (10.0, 30.0):
            s = S[(c, h)]
            t, b = s["test"], s["test"][BASE][0]
            d4.append(t[s["pick"]][0] / b - t[s["pk"]][0] / b)
            x4.append(ratio(t[s["pick"]][1], t[s["pk"]][1]) if t[s["pk"]][1] > 0 else
                      (1.0 if t[s["pick"]][1] <= 0 else float("inf")))
    ok4 = all(x >= -0.005 for x in d4) and sum(x <= 1.2 for x in x4) >= 6
    print(f"P4 at 10 and 30 W pick km / B >= K pick's - 0.005 in 8 of 8 and excess <= 1.2 x K pick's in >= 6 of 8: "
          f"{'held' if ok4 else 'refuted'} (km diff {', '.join(f'{x:+.4f}' for x in d4)}; excess ratio "
          f"{', '.join(f'{x:.2f}' for x in x4)})")
    s = S[(2500.0, 50.0)]
    tau = s["pk"][1]
    mk, mm = s["test"][s["pk"]][2] / nd, s["test"][("M", tau, 0.0)][2] / nd
    print(f"P5 at 2.5 kWh / 50 W, M at the K pick's tau moves on >= 0.05 more of the point-days: "
          f"{'held' if mm - mk >= 0.05 else 'refuted'} (K pick {mk:.3f}, M {mm:.3f})")


if __name__ == "__main__":
    main()
