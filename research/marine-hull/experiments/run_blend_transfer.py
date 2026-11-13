"""Milestone 6zt: does 6zs's half-and-half power estimate transfer across oceans, and is a = 0.5 a grid answer?

Why: 6zs's "Next". 6zs found that planning speed from a L + (1 - a) K (L: the vehicle's 7-day trailing mean harvest,
K: the strict-history day-of-year climatology) with a = 0.5 beats the 7-day trailing-mean rule B on distance and
payload downtime at every 50 W pack, on split T only (select 2015 to 2019, score 2020 to 2024, all 30 points). Two
things a designer needs before adopting it were left open: (1) whether the weight picked on one ocean holds on
another (6zo's space splits, here crossed with the time split so the test set is new in both place and year), and
(2) whether a = 0.5 is just where a three-step weight grid happened to land.

Data: as 6zk to 6zs (NASA POWER daily ALLSKY_SFC_SW_DWN, public domain; experiments/data/). No new data.

Estimator (f(d) in W; h the vehicle's own past daily harvest, hc the strict-history climatology, both Wh/day):
  W(a)  a mean(h[d-7:d]) / 24 + (1 - a) hc(d) / 24,  a in {0, 0.125, ..., 1} (9 weights; W(0) is 6zs's K, W(0.5)
        its B50, W(1) its L at theta 0; with no past harvest the week falls back to the hotel load, as in 6zs)
Inputs swept (not sourced as single figures): 6zp's 12 configurations (packs 2.5, 5, 10, 20 kWh x hotel 10, 30,
50 W); tau in {10, 20, 30, 60} days.

Rules (fixed in this docstring and committed before any configuration below was run):
  Boat, harvest, daily step, launch full on 1 January, the 30 points x 2015 to 2024, the target
  T = lead(max(0.5 C, Rc), 45 days), strict-history climatology from 2015 to 2019 (each selection year's from the
  other years of 2015 to 2019) and the speed rule are 6zs's, gate dropped (theta 0):
    p = f(d) + (SOC - T(d)) / (tau 24)      (speed 0 whenever p <= hotel)
  Grid G: W(a) x tau, 36 variants. Coarse grid G4: a in {0, 0.25, 0.5, 0.75, 1} (6zs's K, B25, B50, B75, L).
  Baseline B = (L, 10, theta 1), unchanged.
  Splits (selection set -> test set):
    T   all 30 points, 2015-2019 -> all 30 points, 2020-2024  (6zs's)
    S1  13 Pacific transect points (150 W), 2015-2019 -> 12 Atlantic transect points (30 W) + 5 corridor sites,
        2020-2024
    S2  12 Atlantic points, 2015-2019 -> 13 Pacific points + 5 corridor sites, 2020-2024
  Selection rule S (6zo to 6zs's): among variants whose summed selection-set excess dark hours are at most B's, the
  most summed km; if none qualifies, the fewest excess dark hours. "pick" = rule S over G; a* its weight.
  "Dominates B" = test km >= B's and test excess dark hours <= B's, on that split's test set.
Predictions:
  P1  Space transfer: at 50 W the pick dominates B on test at at least 3 of the 4 packs in S1 and in S2.
  P2  At 50 W, a* is in [0.25, 0.75] in at least 10 of the 12 (split x pack) cells.
  P3  At 50 W, a* spans at most 0.25 across the three splits at at least 3 of the 4 packs.
  P4  Grid resolution: on split T at 50 W, the pick's test km / B exceeds the G4 pick's by less than 0.01 at all
      4 packs.
  P5  The weight rises with the payload: mean a* over the 12 (split x pack) cells is non-decreasing from 10 to 30 to
      50 W, and at most 0.25 at 10 W.
  P6  A fixed default, no selection: W(0.5) at tau 30 dominates B on test at at least 3 of 4 50 W packs in S1 and in
      S2.
Descriptive (no prediction): per (split, configuration), test km / B and excess / B across the weights at the
  pick's tau; the best-on-test variant.

Run (from research/marine-hull): PYTHONPATH=src python3 experiments/run_blend_transfer.py > experiments/results_blend_transfer.txt
(stdlib, deterministic; uses up to 4 processes)"""
import os
import statistics as st
import sys
from functools import lru_cache
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import run_pack_hotel_tau as pt  # noqa: E402
import run_reserve_curve as rc  # noqa: E402
import run_season_week as sw  # noqa: E402
import run_wave_vs_sun_sites as y  # noqa: E402
import run_year_pack as yp  # noqa: E402

CONFIGS = pt.CONFIGS
PACKS, HOTELS = pt.PACKS, pt.HOTELS
WEIGHTS = tuple(i / 8 for i in range(9))
COARSE = (0.0, 0.25, 0.5, 0.75, 1.0)
TAUS = (10, 20, 30, 60)
GRID = tuple((a, t) for a in WEIGHTS for t in TAUS)
G4 = tuple(g for g in GRID if g[0] in COARSE)
BASE = "B"
DEFAULT = (0.5, 30)
TRAIN, TEST, YEARS = pt.TRAIN, pt.TEST, pt.YEARS
WEEK = sw.WEEK
PTS = tuple(yp.points())
PACIFIC = tuple(p for p in PTS if p.startswith("P"))
ATLANTIC = tuple(p for p in PTS if p.startswith("A"))
CORRIDOR = tuple(p for p in PTS if p not in PACIFIC + ATLANTIC)
SPLITS = {"T": (PTS, PTS), "S1": (PACIFIC, ATLANTIC + CORRIDOR), "S2": (ATLANTIC, PACIFIC + CORRIDOR)}


def estimate(a, h, hc, d, hotel):
    """W(a): a x 7-day trailing mean + (1 - a) x climatology, in W."""
    k = hc[d] / 24.0
    past = h[max(0, d - WEEK):d]
    lw = st.fmean(past) / 24.0 if past else hotel
    if a == 0.0:
        return k
    if a == 1.0:
        return lw
    return a * lw + (1.0 - a) * k


def run(h, T, hc, a, tau, cap, hotel):
    """6zs's run with the gate dropped: (km, dark hours, moving days)."""
    hd = hotel * 24.0
    soc, km, dark, moved = cap, 0.0, 0.0, 0
    for d, e in enumerate(h):
        p = estimate(a, h, hc, d, hotel) + (soc - T[d]) / (tau * 24.0)
        avail = soc + e
        if avail < hd:
            soc = 0.0
            dark += (hd - avail) / hotel
            continue
        v = yp.speed_for_power(p, hotel)
        if avail - yp.load_w(v, hotel) * 24.0 < 0:
            v = y.bisect(lambda x: avail - yp.load_w(x, hotel) * 24.0 >= 0) or 0.0
        soc = min(cap, avail - yp.load_w(v, hotel) * 24.0)
        km += 86.4 * v
        moved += v > 0
    return km, dark, moved


@lru_cache(maxsize=None)
def _clim(p, yr):
    return tuple(rc.climatology_wh(p, yr, years=TRAIN))


def score(key):
    """((cap, hotel, point, year), {variant: (km, excess dark h, moving days)}); variant "B" is the baseline."""
    cap, hotel, p, yr = key
    sun = rc.year_sun(p, yr)
    hc = list(_clim(p, yr))
    T = pt.target(hc, cap, hotel)
    idle_dark = yp.idle(sun, cap, hotel)[1]
    b = sw.run(sun, T, hc, *sw.BASE, cap, hotel)
    out = {BASE: (b["km"], b["dark"] - idle_dark, b["moved"])}
    h = [yp.harvest_wh(k) for k in sun]
    for a, tau in GRID:
        km, dark, moved = run(h, T, hc, a, tau, cap, hotel)
        out[(a, tau)] = (km, dark - idle_dark, moved)
    return key, out


def total(cells, keys):
    first = cells[keys[0]]
    return {g: tuple(sum(cells[k][g][i] for k in keys) for i in range(3)) for g in first}


def select(tot, grid=GRID):
    """Rule S over `grid` with B as the reference."""
    b_ex = tot[BASE][1]
    ok = [g for g in grid if tot[g][1] <= b_ex]
    if ok:
        return max(ok, key=lambda g: tot[g][0])
    return min(grid, key=lambda g: tot[g][1])


def dominates(t, g):
    return t[g][0] >= t[BASE][0] and t[g][1] <= t[BASE][1]


def ratio(a, b):
    return a / b if b else float("nan")


def evaluate(configs=CONFIGS, points=PTS, procs=4):
    keys = [(c, h, p, yr) for c, h in configs for p in points for yr in YEARS]
    with Pool(procs) as pool:
        return dict(pool.map(score, keys, chunksize=5))


def summarise(cells, configs=CONFIGS, splits=SPLITS):
    out = {}
    for name, (sp, tp) in splits.items():
        for c, h in configs:
            sel = total(cells, [(c, h, p, yr) for p in sp for yr in TRAIN])
            test = total(cells, [(c, h, p, yr) for p in tp for yr in TEST])
            out[(name, c, h)] = {"sel": sel, "test": test, "pick": select(sel), "p4": select(sel, G4),
                                 "best_test": select(test)}
    return out


def main():
    cells = evaluate()
    S = summarise(cells)
    print("Milestone 6zt: the blend a L + (1 - a) K across oceans, on a 9-step weight grid")
    print(f"packs {[int(c) for c in PACKS]} Wh x hotel {[int(h) for h in HOTELS]} W; weights {WEIGHTS} x tau {TAUS}, "
          f"gate theta 0; B = {sw.BASE}; target lead 45 days; splits T, S1 (Pacific -> Atlantic + corridor), "
          f"S2 (Atlantic -> Pacific + corridor), all select 2015-2019 and test 2020-2024")

    for (name, c, h), s in S.items():
        t, b = s["test"], s["test"][BASE]
        tau = s["pick"][1]
        print(f"\n[{name}] C {c / 1000:.1f} kWh, hotel {h:.0f} W: pick a {s['pick'][0]:.3f} tau {tau}; G4 pick "
              f"a {s['p4'][0]:.2f} tau {s['p4'][1]}; best-on-test a {s['best_test'][0]:.3f} tau {s['best_test'][1]}; "
              f"test B km {b[0]:.0f}, excess {b[1]:.0f}")
        print("     a     | " + " | ".join(f"tau {x:2d} km/B  ex/B" for x in TAUS))
        for a in WEIGHTS:
            cols = [f"{t[(a, x)][0] / b[0]:11.4f} {ratio(t[(a, x)][1], b[1]):5.2f}" for x in TAUS]
            print(f"     {a:.3f} | " + " | ".join(cols))

    print("\nSummary (test sets 2020-2024; picks made on each split's 2015-2019 selection set)")
    print("   split  C kWh hotel W |  a*    tau | km/B    ex/B  dom | G4 a  tau  km/B   | default(0.5,30) km/B  ex/B dom")
    for (name, c, h), s in S.items():
        t, b = s["test"], s["test"][BASE]
        k, q, d = t[s["pick"]], t[s["p4"]], t[DEFAULT]
        print(f"   {name:5s} {c / 1000:5.1f} {h:7.0f} | {s['pick'][0]:.3f} {s['pick'][1]:4d} | {k[0] / b[0]:.4f} "
              f"{ratio(k[1], b[1]):5.3f}  {'y' if dominates(t, s['pick']) else 'n'}  | {s['p4'][0]:.2f} {s['p4'][1]:4d} "
              f"{q[0] / b[0]:.4f} | {d[0] / b[0]:20.4f} {ratio(d[1], b[1]):5.3f} {'y' if dominates(t, DEFAULT) else 'n'}")

    print("\nPredictions")
    dom = {n: [c for c in PACKS if dominates(S[(n, c, 50.0)]["test"], S[(n, c, 50.0)]["pick"])] for n in ("S1", "S2")}
    ok1 = all(len(v) >= 3 for v in dom.values())
    print(f"P1 at 50 W the pick dominates B on test at >= 3 of 4 packs in S1 and S2: {'held' if ok1 else 'refuted'} "
          f"(S1 {len(dom['S1'])} of 4, S2 {len(dom['S2'])} of 4)")
    a50 = {(n, c): S[(n, c, 50.0)]["pick"][0] for n in SPLITS for c in PACKS}
    n2 = sum(0.25 <= a <= 0.75 for a in a50.values())
    print(f"P2 at 50 W a* in [0.25, 0.75] in >= 10 of 12 cells: {'held' if n2 >= 10 else 'refuted'} ({n2} of 12: "
          f"{', '.join(f'{n}/{c / 1000:g} {a:.3f}' for (n, c), a in a50.items())})")
    span = {c: max(a50[(n, c)] for n in SPLITS) - min(a50[(n, c)] for n in SPLITS) for c in PACKS}
    n3 = sum(v <= 0.25 for v in span.values())
    print(f"P3 at 50 W a* spans <= 0.25 across splits at >= 3 of 4 packs: {'held' if n3 >= 3 else 'refuted'} "
          f"({', '.join(f'{c / 1000:g} kWh {v:.3f}' for c, v in span.items())})")
    g4 = []
    for c in PACKS:
        s = S[("T", c, 50.0)]
        t, b = s["test"], s["test"][BASE][0]
        g4.append(t[s["pick"]][0] / b - t[s["p4"]][0] / b)
    print(f"P4 split T, 50 W: pick km/B - G4 pick km/B < 0.01 at all 4 packs: "
          f"{'held' if all(x < 0.01 for x in g4) else 'refuted'} ({', '.join(f'{x:+.4f}' for x in g4)})")
    means = {h: st.fmean(S[(n, c, h)]["pick"][0] for n in SPLITS for c in PACKS) for h in HOTELS}
    m = [means[h] for h in HOTELS]
    ok5 = m[0] <= m[1] <= m[2] and m[0] <= 0.25
    print(f"P5 mean a* non-decreasing 10 -> 30 -> 50 W and <= 0.25 at 10 W: {'held' if ok5 else 'refuted'} "
          f"({', '.join(f'{h:.0f} W {means[h]:.3f}' for h in HOTELS)})")
    dd = {n: [c for c in PACKS if dominates(S[(n, c, 50.0)]["test"], DEFAULT)] for n in ("S1", "S2")}
    ok6 = all(len(v) >= 3 for v in dd.values())
    print(f"P6 W(0.5) tau 30 dominates B at >= 3 of 4 50 W packs in S1 and S2: {'held' if ok6 else 'refuted'} "
          f"(S1 {len(dd['S1'])} of 4, S2 {len(dd['S2'])} of 4)")


if __name__ == "__main__":
    main()
