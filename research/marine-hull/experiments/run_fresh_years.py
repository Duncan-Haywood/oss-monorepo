"""Milestone 6zx: do 6zv's feedback-time table and 6zw's adaptive rule hold on ten years the programme has never read?

Why: 6zw's "Next". 6zw's adaptive rule AT_N (the boat computes r(d) = trailing-N-day harvest / trailing-N-day
climatology and picks its battery feedback time tau from 6zv's four-step table at eff_hat = 1 / r) dominated the
7-day trailing-mean rule B in 46 of 56 cells (AT_90: 48), but the table was read from 6zv's results on those same
cells (2015 to 2024). This milestone freezes everything and scores it on 2005 to 2014, years no milestone has used.

Design (fixed here, before any configuration below was run, and before the 2005 to 2014 data were looked at beyond
the fetch's day and fill counts):
  Data: NASA POWER daily ALLSKY_SFC_SW_DWN 2005 to 2014 at the same 30 points (experiments/fetch_sun_2005_2014.py,
  experiments/data/sun_30pts_2005_2014.json). Climatology: all ten years 2015 to 2024 (the years the table and rule
  were read from), so no test-year data enters any plan, and the plan is a later climatology applied to earlier
  weather (a stationarity check, as 6zu). Scored halves: "E" 2005 to 2009, "L" 2010 to 2014.
  Bias sweep: climatology multiplied by s in {0.97, ..., 1.03} before anything uses it (estimate term K and the
  45-day-lead target every rule steers to, B included; B rerun at each s), as 6zv. 50 W payload, packs 2.5, 5, 10,
  20 kWh, 30 points, launched full each 1 January. 56 (s x half x pack) cells; "dominates B" = cell km >= B's and
  cell excess dark hours (over an idle boat's) <= B's.
  Frozen from earlier milestones, unchanged: weights a = PS's per pack (0.5, 0.5, 0.375, 0.375); the tau table
  60 / 30 / 20 / 10 at eff < 0.985 / 1.015 / 1.025 / above (6zv); the ratio with a 14-day prior at ratio 1 (6zw);
  PS's and PSS's fixed taus (6zt, 6zu).
  Rules: AT_30, AT_60, AT_90 (6zw's rule, unchanged); OR (oracle: tau from the cell's true eff = s / realised, where
  realised = that half's all-points harvest / unscaled climatology, computed from the test data; not available to
  a boat); PS; PSS; B.
Predictions:
  P1  AT_60 dominates B in at least 40 of the 56 cells (6zw: 46).
  P2  AT_60 dominates B in at least 5 of the 8 (half x pack) cells at every s.
  P3  AT_60 dominates B in more of the 56 cells than PS and more than PSS.
  P4  AT_90 dominates in at least as many cells as AT_60, and AT_60 in at least as many as AT_30 (6zw's ordering).
  P5  AT_60's dominance count is within 4 of OR's.
  P6  AT_60's km / B is at least 1.0 in at least 50 of the 56 cells.
  P7  Both halves' realised / climatology lie within 0.985 to 1.015 (the 2015-2024 climatology is not off by more
      than 6zv's central table band on 2005 to 2014).
Descriptive: realised / climatology per half and per region; per cell km/B, ex/B, dominance for AT_60, AT_90, OR,
  PS, PSS; counts per s; share of days AT_60 spends at each tau; the estimator's mean eff_hat against the true eff.

Run (from research/marine-hull): PYTHONPATH=src python3 experiments/run_fresh_years.py > experiments/results_fresh_years.txt
(stdlib, deterministic; uses up to 4 processes)"""
import json
import os
import sys
from functools import lru_cache
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import run_bias_sweep as bs  # noqa: E402
import run_blend_transfer as bt  # noqa: E402
import run_pack_hotel_tau as pt  # noqa: E402
import run_reserve_curve as rc  # noqa: E402
import run_season_week as sw  # noqa: E402
import run_self_bias as sb  # noqa: E402
import run_year_pack as yp  # noqa: E402

DATA_FILE = os.path.join(HERE, "data", "sun_30pts_2005_2014.json")
PACKS, HOTEL, SCALES, BASE = bs.PACKS, bs.HOTEL, bs.SCALES, bs.BASE
PS, PSS = bs.PS, bs.PSS
CLIM_YEARS = tuple(range(2015, 2025))
HALVES = {"E": tuple(range(2005, 2010)), "L": tuple(range(2010, 2015))}
YEARS = HALVES["E"] + HALVES["L"]
WINDOWS, PRIMARY = sb.WINDOWS, sb.PRIMARY
TAUS_OUT = sb.TAUS_OUT
RULES = ("AT_30", "AT_60", "AT_90", "OR", "PS", "PSS")
REGIONS = {"All": bt.PTS, "Pacific": bt.PACIFIC, "Atlantic": bt.ATLANTIC, "Corridor": bt.CORRIDOR}


def load():
    """Add 2005 to 2014 to rc.series's per-point dicts (idempotent)."""
    import datetime
    new = json.load(open(DATA_FILE))
    for p in bt.PTS:
        s = rc.series(p)
        if "20050101" in s:
            continue
        d0 = datetime.date(2005, 1, 1)
        for i, v in enumerate(new[p]["values"]):
            s[(d0 + datetime.timedelta(days=i)).strftime("%Y%m%d")] = v


@lru_cache(maxsize=None)
def _clim(p, yr):
    return tuple(rc.climatology_wh(p, yr, years=CLIM_YEARS))


@lru_cache(maxsize=None)
def _sun(p, yr):
    sun = rc.year_sun(p, yr)
    return sun, tuple(yp.harvest_wh(k) for k in sun)


def half_of(yr):
    return "E" if yr in HALVES["E"] else "L"


def realised(points=bt.PTS):
    """{half: sum harvest / sum unscaled climatology over points x years}."""
    out = {}
    for hn, yrs in HALVES.items():
        h = sum(sum(_sun(p, yr)[1]) for p in points for yr in yrs)
        c = sum(sum(_clim(p, yr)) for p in points for yr in yrs)
        out[hn] = h / c
    return out


REALISED = {}


def score(key):
    """((cap, point, year, s), {rule: (km, excess dark h, tau-days)}, (sum eff_hat, days))."""
    cap, p, yr, s = key
    sun, h = _sun(p, yr)
    h = list(h)
    hc = [s * x for x in _clim(p, yr)]
    T = pt.target(hc, cap, HOTEL)
    idle_dark = yp.idle(sun, cap, HOTEL)[1]
    b = sw.run(sun, T, hc, *sw.BASE, cap, HOTEL)
    out = {BASE: (b["km"], b["dark"] - idle_dark, None)}
    a = PS[cap][0]
    ones = [1.0] * len(h)
    r = {n: sb.ratios(h, hc, n) for n in WINDOWS}
    eff_true = s / REALISED[half_of(yr)]
    plans = {f"AT_{n}": [sb.tau_of(1.0 / x) for x in r[n]] for n in WINDOWS}
    plans["OR"] = [sb.tau_of(eff_true)] * len(h)
    plans["PS"] = [PS[cap][1]] * len(h)
    plans["PSS"] = [PSS[cap][1]] * len(h)
    for name, taus in plans.items():
        km, dark, days = sb.run(h, T, hc, a, taus, ones, cap, HOTEL)
        out[name] = (km, dark - idle_dark, days)
    return key, out, (sum(1.0 / x for x in r[PRIMARY]), len(h))


def prepare():
    load()
    if not REALISED:
        REALISED.update(realised())


def evaluate(points=bt.PTS, procs=4):
    prepare()
    keys = [(c, p, yr, s) for p in points for yr in YEARS for c in PACKS for s in SCALES]
    with Pool(procs) as pool:
        res = pool.map(score, keys, chunksize=7)
    return {k: o for k, o, _ in res}, {k: e for k, _, e in res}


def cells_of(cells, points=bt.PTS):
    return {(s, hn, c): sb.total(cells, [(c, p, yr, s) for p in points for yr in yrs])
            for s in SCALES for hn, yrs in HALVES.items() for c in PACKS}


def main():
    cells, est = evaluate()
    C = cells_of(cells)
    yn = lambda x: "y" if x else "n"  # noqa: E731
    print("Milestone 6zx: 6zv's tau table and 6zw's adaptive rule, frozen, on 2005 to 2014 (50 W payload)")
    print(f"climatology from {CLIM_YEARS[0]} to {CLIM_YEARS[-1]}; bias scales s in {SCALES}; weights a = PS's; "
          "tau table 60 / 30 / 20 / 10 at eff < 0.985 / 1.015 / 1.025 / above; prior 14 days at ratio 1")

    print("\nRealised harvest / unscaled climatology, by half and region")
    for rn, pts in REGIONS.items():
        rr = realised(pts)
        print(f"   {rn:9s} " + "  ".join(f"{hn} {rr[hn]:.4f}" for hn in HALVES))

    print("\nEstimator: day-weighted mean eff_hat (N 60) per (s, half), all points x years, against the true eff")
    for s in SCALES:
        for hn, yrs in HALVES.items():
            ks = [(PACKS[0], p, yr, s) for p in bt.PTS for yr in yrs]
            m = sum(est[k][0] for k in ks) / sum(est[k][1] for k in ks)
            e = s / REALISED[hn]
            print(f"   s {s:4.2f} {hn}: eff {e:.4f}  mean eff_hat {m:.4f}  diff {m - e:+.4f}")

    show = ("AT_60", "AT_90", "OR", "PS", "PSS")
    print("\nPer cell (half, pack, s): km/B ex/B dominates, for " + ", ".join(show))
    print("  half C kWh   s  | " + " | ".join(f"{g:>5s} km/B ex/B d" for g in show))
    for hn in HALVES:
        for c in PACKS:
            for s in SCALES:
                t = C[(s, hn, c)]
                b = t[BASE]
                parts = [f"{t[g][0] / b[0]:10.4f} {bt.ratio(t[g][1], b[1]):4.2f} {yn(sb.dominates(t, g))}"
                         for g in show]
                print(f"  {hn:4s} {c / 1000:5.1f} {s:4.2f} | " + " | ".join(parts))

    print("\nDominance counts per s (of 8 half x pack cells)")
    print("     s  | " + " | ".join(f"{g:>5s}" for g in RULES))
    cnt = {}
    for s in SCALES:
        ks = [(s, hn, c) for hn in HALVES for c in PACKS]
        cnt[s] = {g: sum(sb.dominates(C[k], g) for k in ks) for g in RULES}
        print(f"  {s:4.2f}  | " + " | ".join(f"{cnt[s][g]:5d}" for g in RULES))
    tot = {g: sum(cnt[s][g] for s in SCALES) for g in RULES}
    print("  total | " + " | ".join(f"{tot[g]:5d}" for g in RULES))

    print("\nShare of days AT_60 spends at each tau (all packs), per s and half")
    print("     s  half | " + " | ".join(f"tau {t:2d}" for t in TAUS_OUT))
    for s in SCALES:
        for hn in HALVES:
            days = dict.fromkeys(TAUS_OUT, 0)
            for c in PACKS:
                for t, n in C[(s, hn, c)]["AT_60"][2].items():
                    days[t] += n
            n = sum(days.values())
            print(f"  {s:4.2f}  {hn:4s} | " + " | ".join(f"{days[t] / n:6.3f}" for t in TAUS_OUT))

    print("\nPredictions")
    print(f"P1 AT_60 dominates in >= 40 of 56: {'held' if tot['AT_60'] >= 40 else 'refuted'} ({tot['AT_60']} of 56)")
    per = [cnt[s]["AT_60"] for s in SCALES]
    print(f"P2 AT_60 dominates in >= 5 of 8 at every s: {'held' if min(per) >= 5 else 'refuted'} ({per})")
    ok3 = tot["AT_60"] > tot["PS"] and tot["AT_60"] > tot["PSS"]
    print(f"P3 AT_60 > PS and > PSS: {'held' if ok3 else 'refuted'} "
          f"(AT_60 {tot['AT_60']}, PS {tot['PS']}, PSS {tot['PSS']})")
    ok4 = tot["AT_90"] >= tot["AT_60"] >= tot["AT_30"]
    print(f"P4 AT_90 >= AT_60 >= AT_30: {'held' if ok4 else 'refuted'} "
          f"(AT_30 {tot['AT_30']}, AT_60 {tot['AT_60']}, AT_90 {tot['AT_90']})")
    print(f"P5 AT_60 within 4 of OR: {'held' if abs(tot['AT_60'] - tot['OR']) <= 4 else 'refuted'} "
          f"(AT_60 {tot['AT_60']}, OR {tot['OR']})")
    km = [C[(s, hn, c)]["AT_60"][0] / C[(s, hn, c)][BASE][0] for s in SCALES for hn in HALVES for c in PACKS]
    n6 = sum(x >= 1.0 for x in km)
    print(f"P6 AT_60 km/B >= 1.0 in >= 50 of 56: {'held' if n6 >= 50 else 'refuted'} ({n6} of 56; min {min(km):.4f})")
    ok7 = all(0.985 <= REALISED[hn] <= 1.015 for hn in HALVES)
    print(f"P7 realised / climatology within 0.985 to 1.015 in both halves: {'held' if ok7 else 'refuted'} "
          f"({', '.join(f'{hn} {REALISED[hn]:.4f}' for hn in HALVES)})")


if __name__ == "__main__":
    main()
