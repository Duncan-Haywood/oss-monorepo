"""Milestone 6zo: does 6zn's climatology power estimate (K) keep its gain on years and places it was not picked on?
A held-out check of a post hoc result, with the pack-feedback time constant picked out of sample.

Why: 6zn found that foresight's distance edge is even spending, not sun-chasing, and post hoc that planning speed
from today's climatological harvest (K) instead of the 7-day trailing mean (L) gave 1.022 x (L)'s km at 0.27 x its
excess dark hours, and (K30) (a 30-day pack feedback) 1.050 x km at 1.09 x dark hours, half the gap to the
foresight plan (Fh). Those four variants were read off the same 300 point-years they were scored on, and the
climatology was leave-one-year-out over all ten years, so a test year's (K) used later years' sun. This step picks
the estimator and the feedback constant on one part of the data and scores them on another, with a grid fixed here.

Data: as 6zk to 6zn (NASA POWER daily ALLSKY_SFC_SW_DWN, public domain; experiments/data/). No new data.

Rules (fixed in this docstring and committed before any split below was run):
  Boat, pack (C = 10 kWh), hotel (30 W), harvest, daily step, launch full on 1 January, 30 points x 2015 to 2024,
  speed rule p = f(d) + (SOC - T(d)) / (tau x 24 h) (or the hotel load when f(d) < hotel), idle vehicle and excess
  dark hours: 6zn's run_rule, unchanged. Target T = 6zm's pick, lead(max(0.5 C, Rc), 45 days), built from the same
  climatology hc as the power estimate in every cell.
  Power estimates f(d) (W):
    (L)   trailing 7-day mean harvest (6zm's and 6zn's baseline);
    (L30) trailing 30-day mean harvest;
    (K)   hc(d), today's climatological harvest;
    (KA)  hc(d) x a, with a = (harvest of the last 30 days) / (hc over the same 30 days) clipped to [0.5, 1.5]
          (a = 1 on 1 January): climatology scaled by the recent anomaly. New in this step.
  Grid G: estimator in {L, L30, K, KA} x tau in {10, 20, 30, 45, 60, 90} days (24 variants). Baseline B = (L, 10),
  6zn's (L), built from the same climatology as the variant.
  Selection rule S (every split): on the selection set, among variants whose summed excess dark hours are at most
  B's on that set, the one with the most summed km; if none qualifies, the one with the fewest summed excess dark h.
  Split T (time, strict history): select on 2015 to 2019 at all 30 points, each year's climatology from the other
  years of 2015 to 2019; score on 2020 to 2024 with every test year's climatology from 2015 to 2019.
  Splits S1 / S2 (space): select on the 13 Pacific (150 W) / 12 Atlantic (30 W) transect points, score on the other
  transect plus the 5 corridor sites; leave-one-year-out climatology over all ten years (6zm's splits).
  Bound: (Fh), 6zn's foresight plan that must end the year with at least 0.5 C (no climatology; same in every split).
  "Share closed" = (km_variant - km_B) / (km_Fh - km_B) on the scored set.
Predictions:
  P1  Split T: the picked variant's test km is at least 1.02 x B's and its test excess dark hours at most 1.25 x B's.
  P2  Split T picks a climatology estimator, (K) or (KA).
  P3  Strict history keeps most of (K)'s in-sample result: on 2020 to 2024, (K, 10) has km at least 1.015 x B's and
      excess dark hours at most 0.6 x B's.
  P4  The anomaly scaling adds little: on split T's test set, (KA) at its own best-on-selection tau (rule S over the
      six (KA) variants) and (K) at its own best-on-selection tau differ by less than 0.5% in km.
  P5  Splits S1 and S2: in both, the picked variant's test km is at least 1.02 x B's with test excess dark hours at
      most 1.25 x B's.
  P6  Split T: the picked variant closes at least a quarter of the km gap from B to (Fh) on the test set.
Descriptive (no prediction): the full grid on every selection and test set; 6zn's in-sample (K), (K30), (K60) on each
  test set; per |lat| band, test km / B and mean excess dark hours for the picked variant and (Fh).

Run (from research/marine-hull): PYTHONPATH=src python3 experiments/run_power_estimate_holdout.py > experiments/results_power_estimate_holdout.txt
(stdlib, deterministic; uses up to 4 processes)"""
import os
import statistics as st
import sys
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import run_reserve_curve as rc  # noqa: E402
import run_speed_timing as sp  # noqa: E402
import run_wave_vs_sun_sites as y  # noqa: E402
import run_year_pack as yp  # noqa: E402

C = rc.C
HOTEL = rc.HOTEL
YEARS = rc.YEARS
TRAIN = tuple(yr for yr in YEARS if yr <= 2019)
TEST = tuple(yr for yr in YEARS if yr >= 2020)
ESTIMATORS = ("L", "L30", "K", "KA")
TAUS = (10, 20, 30, 45, 60, 90)
GRID = tuple((e, t) for e in ESTIMATORS for t in TAUS)
BASE = ("L", 10)
INSAMPLE = (("K", 10), ("K", 30), ("K", 60))
BANDS = sp.BANDS
ANOM_DAYS = 30
ANOM_CLIP = (0.5, 1.5)
PACIFIC = tuple(p for p in yp.points() if p.startswith("P"))
ATLANTIC = tuple(p for p in yp.points() if p.startswith("A"))
CORRIDOR = tuple(p for p in yp.points() if p not in PACIFIC + ATLANTIC)


def power_estimate(est, h, hc, d, hotel=HOTEL):
    """f(d) in W for estimator `est`, from past harvest h[:d] and the climatology hc (Wh/day)."""
    if est in ("L", "L30"):
        past = h[max(0, d - (7 if est == "L" else 30)):d]
        return st.fmean(past) / 24.0 if past else hotel
    if est == "K":
        return hc[d] / 24.0
    if est == "KA":
        lo = max(0, d - ANOM_DAYS)
        den = sum(hc[lo:d])
        a = sum(h[lo:d]) / den if d and den > 0 else 1.0
        return hc[d] * min(ANOM_CLIP[1], max(ANOM_CLIP[0], a)) / 24.0
    raise ValueError(est)


def run_est(sun, T, hc, est, tau, cap=C, hotel=HOTEL):
    """6zn's run_rule with a pluggable power estimate (no spill recapture): dict km, down, dark."""
    h = [yp.harvest_wh(k) for k in sun]
    hd = hotel * 24.0
    soc, km, down, dark = cap, 0.0, 0, 0.0
    for d, e in enumerate(h):
        f = power_estimate(est, h, hc, d, hotel)
        p = hotel if f < hotel else f + (soc - T[d]) / (tau * 24.0)
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
    return {"km": km, "down": down, "dark": dark}


def score(key):
    """((point, year, pool), {variant: (km, excess dark h)}) with the climatology from `pool` (minus the year)."""
    p, yr, pool = key
    sun = rc.year_sun(p, yr)
    hc = rc.climatology_wh(p, yr, years=pool)
    T = sp.target(hc)
    idle_dark = yp.idle(sun)[1]
    out = {}
    for est, tau in GRID:
        r = run_est(sun, T, hc, est, tau)
        out[(est, tau)] = (r["km"], r["dark"] - idle_dark)
    return key, out


def bound(key):
    p, yr = key
    sun = rc.year_sun(p, yr)
    r = sp.foresight_acct(sun, yp.prop_table(), end_min=0.5 * C)
    return key, (r["km"], r["dark"] - yp.idle(sun)[1])


def table(cells):
    """cells: {(point, year): {variant: (km, excess)}} -> {variant: (summed km, summed excess)}."""
    keys = next(iter(cells.values())).keys()
    return {k: (sum(c[k][0] for c in cells.values()), sum(c[k][1] for c in cells.values())) for k in keys}


def select(tot, grid=GRID):
    """Selection rule S over `grid` (B is always the reference)."""
    b_ex = tot[BASE][1]
    ok = [g for g in grid if tot[g][1] <= b_ex]
    if ok:
        return max(ok, key=lambda g: tot[g][0])
    return min(grid, key=lambda g: tot[g][1])


def share(tot, g):
    a, b, c = tot[BASE][0], tot[g][0], tot["Fh"][0]
    return (b - a) / (c - a) if c != a else float("nan")


def print_grid(name, tot, with_f=False):
    b = tot[BASE]
    print(f"   {name}: B km {b[0]:.0f}, excess dark h {b[1]:.0f}" +
          (f"; (Fh) km {tot['Fh'][0]:.0f} ({tot['Fh'][0] / b[0]:.4f} x B)" if with_f else ""))
    print("     est   tau |   km / B | excess dark h | excess / B" + (" | share B->(Fh)" if with_f else ""))
    for g in GRID:
        t = tot[g]
        print(f"     {g[0]:>4} {g[1]:4d} | {t[0] / b[0]:8.4f} | {t[1]:13.0f} | "
              f"{t[1] / b[1] if b[1] else float('nan'):10.3f}" + (f" | {share(tot, g):13.3f}" if with_f else ""))


def bands(cells, fh, g):
    print(f"   test set, picked {g} and (Fh) against B by |lat| band:")
    for lo, hi in BANDS:
        ks = [k for k in cells if lo <= abs(yp.lat_of(k[0])) <= hi]
        if not ks:
            continue
        kb = sum(cells[k][BASE][0] for k in ks)
        print(f"     |lat| {lo:2d}-{hi:2d} ({len(ks):3d}): km / B {sum(cells[k][g][0] for k in ks) / kb:.4f}, "
              f"(Fh) {sum(fh[k][0] for k in ks) / kb:.4f}; mean excess dark h/yr B "
              f"{st.fmean(cells[k][BASE][1] for k in ks):.1f}, picked {st.fmean(cells[k][g][1] for k in ks):.1f}, "
              f"(Fh) {st.fmean(fh[k][1] for k in ks):.1f}")


def run_split(name, sel_cells, test_cells, fh):
    sel_tot, test_tot = table(sel_cells), table(test_cells)
    test_tot["Fh"] = (sum(fh[k][0] for k in test_cells), sum(fh[k][1] for k in test_cells))
    pick = select(sel_tot)
    print(f"\n{name}")
    print_grid(f"selection set ({len(sel_cells)} point-years)", sel_tot)
    print(f"   picked by rule S: {pick}")
    print_grid(f"test set ({len(test_cells)} point-years)", test_tot, with_f=True)
    t, b = test_tot[pick], test_tot[BASE]
    print(f"   picked on test: km {t[0] / b[0]:.4f} x B, excess dark h {t[1]:.0f} against B {b[1]:.0f} "
          f"({t[1] / b[1]:.3f} x), share of B->(Fh) closed {share(test_tot, pick):.3f}")
    for g in INSAMPLE:
        t = test_tot[g]
        print(f"   6zn in-sample {g} on test: km {t[0] / b[0]:.4f} x B, excess {t[1]:.0f} ({t[1] / b[1]:.3f} x), "
              f"share {share(test_tot, g):.3f}")
    bands(test_cells, fh, pick)
    return pick, sel_tot, test_tot


def evaluate(procs=4):
    pts = yp.points()
    keys = [(p, yr, TRAIN) for p in pts for yr in YEARS] + [(p, yr, YEARS) for p in pts for yr in YEARS]
    fkeys = [(p, yr) for p in pts for yr in YEARS]
    with Pool(procs) as pool:
        cells = dict(pool.map(score, keys, chunksize=4))
        fh = dict(pool.map(bound, fkeys, chunksize=2))
    return cells, fh


def main():
    cells, fh = evaluate()
    pts = yp.points()
    print("Milestone 6zo: held-out check of 6zn's climatology power estimate and the pack-feedback constant")
    print(f"pack {C:.0f} Wh, hotel {HOTEL:.0f} W; target lead {sp.LEAD} days; grid estimator {ESTIMATORS} x tau "
          f"{TAUS} days; B = {BASE}; selection rule S: most km with excess dark h <= B's")

    sel = {(p, yr): cells[(p, yr, TRAIN)] for p in pts for yr in TRAIN}
    test = {(p, yr): cells[(p, yr, TRAIN)] for p in pts for yr in TEST}
    pick_t, sel_t, tot_t = run_split("Split T: select on 2015-2019 (climatology from the other 2015-2019 years), "
                                     "score on 2020-2024 (climatology from 2015-2019)", sel, test, fh)
    loo = {(p, yr): cells[(p, yr, YEARS)] for p in pts for yr in YEARS}
    pick_1, _, tot_1 = run_split("Split S1: select on the Pacific transect, score on the Atlantic transect + corridor "
                                 "(leave-one-year-out climatology, all ten years)",
                                 {k: v for k, v in loo.items() if k[0] in PACIFIC},
                                 {k: v for k, v in loo.items() if k[0] in ATLANTIC + CORRIDOR}, fh)
    pick_2, _, tot_2 = run_split("Split S2: select on the Atlantic transect, score on the Pacific transect + corridor",
                                 {k: v for k, v in loo.items() if k[0] in ATLANTIC},
                                 {k: v for k, v in loo.items() if k[0] in PACIFIC + CORRIDOR}, fh)

    print("\nPredictions")
    t, b = tot_t[pick_t], tot_t[BASE]
    ok1 = t[0] >= 1.02 * b[0] and t[1] <= 1.25 * b[1]
    print(f"P1 split T: picked km >= 1.02 x B and excess <= 1.25 x B: {'held' if ok1 else 'refuted'} "
          f"({pick_t}: km {t[0] / b[0]:.4f} x, excess {t[1]:.0f} against {b[1]:.0f}, {t[1] / b[1]:.3f} x)")
    print(f"P2 split T picks (K) or (KA): {'held' if pick_t[0] in ('K', 'KA') else 'refuted'} ({pick_t})")
    k10 = tot_t[("K", 10)]
    ok3 = k10[0] >= 1.015 * b[0] and k10[1] <= 0.6 * b[1]
    print(f"P3 split T test, (K, 10) km >= 1.015 x B and excess <= 0.6 x B: {'held' if ok3 else 'refuted'} "
          f"(km {k10[0] / b[0]:.4f} x, excess {k10[1] / b[1]:.3f} x)")
    gk = select(sel_t, tuple(g for g in GRID if g[0] == "K"))
    gka = select(sel_t, tuple(g for g in GRID if g[0] == "KA"))
    rel = tot_t[gka][0] / tot_t[gk][0]
    print(f"P4 split T test, best-on-selection (KA) {gka} and (K) {gk} within 0.5% km: "
          f"{'held' if abs(rel - 1) < 0.005 else 'refuted'} ((KA) / (K) {rel:.4f}; excess (KA) {tot_t[gka][1]:.0f}, "
          f"(K) {tot_t[gk][1]:.0f})")
    ok5 = []
    for nm, pk, tt in (("S1", pick_1, tot_1), ("S2", pick_2, tot_2)):
        a, bb = tt[pk], tt[BASE]
        good = a[0] >= 1.02 * bb[0] and a[1] <= 1.25 * bb[1]
        ok5.append(good)
        print(f"   {nm} picked {pk}: km {a[0] / bb[0]:.4f} x B, excess {a[1]:.0f} against B {bb[1]:.0f} "
              f"({a[1] / bb[1]:.3f} x): {'both hold' if good else 'fails'}")
    print(f"P5 splits S1 and S2: {'held' if all(ok5) else 'refuted'}")
    s6 = share(tot_t, pick_t)
    print(f"P6 split T: picked closes >= 1/4 of B->(Fh) on test: {'held' if s6 >= 0.25 else 'refuted'} ({s6:.3f})")


if __name__ == "__main__":
    main()
