"""Milestone 6zy: does 6zw's adaptive feedback rule survive a climatology whose bias changes with the season?

Why: 6zx's first "Next". 6zv to 6zx swept a uniform multiplicative bias (climatology x s all year). Real
climatology errors vary by season (cloud regimes, monsoons, storm tracks), so the bias a boat sees in March
need not be the one it sees in September. A trailing harvest / climatology ratio over N days lags a seasonal
bias by about N / 2 days and attenuates it, so a long window that won under a uniform bias (AT_90 >= AT_60 >=
AT_30 in 6zw and 6zx) may lose here, and a single fixed tau (PS, PSS) has nothing to adapt with.

Design (fixed here, before any configuration below was run):
  Data and split exactly as 6zx: NASA POWER daily ALLSKY_SFC_SW_DWN 2005 to 2014 at the 30 points
  (experiments/data/sun_30pts_2005_2014.json), climatology from all ten of 2015 to 2024, scored halves "E"
  2005 to 2009 and "L" 2010 to 2014. 50 W payload, packs 2.5, 5, 10, 20 kWh, launched full each 1 January.
  Bias: the climatology used by every rule (estimate term K and the 45-day-lead target, B included; B rerun)
  is multiplied, day by day, by s(d) = 1 + A cos(2 pi (d - phi) / 365.25), d the day of the year from 0 on
  1 January. A in {0.01, 0.02, 0.03} (6zv's uniform sweep reached 3%); phi in {0, 91, 182, 274} days (bias
  peaks on 1 January, 1 April, 2 July, 1 October). Plus the flat reference A = 0 (6zx's s = 1.00 cells).
  96 seasonal cells (12 shapes x 2 halves x 4 packs) and 8 reference cells; "dominates B" = cell km >= B's and
  cell excess dark hours (over an idle boat's) <= B's, as 6zv to 6zx.
  Frozen, unchanged: weights a = PS's per pack; the tau table 60 / 30 / 20 / 10 at eff < 0.985 / 1.015 /
  1.025 / above (6zv); the ratio with a 14-day prior at ratio 1 (6zw); PS's and PSS's fixed taus.
  Rules: AT_30, AT_60, AT_90 (6zw's rule); OR (a per-day oracle: tau from s(d) / realised for that half, the
  bias the boat would see if it knew the climatology's error on each day; not available to a boat); PS; PSS.
Predictions (priors in brackets):
  Q1  AT_90 dominates B in at least 72 of the 96 seasonal cells (75%; 6zx's uniform sweep 51 of 56 = 91%). [60%]
  Q2  The window ordering of 6zw / 6zx reverses or ties on the seasonal cells: AT_30 >= AT_90. [35%]
  Q3  AT_90's seasonal dominance count falls with amplitude: count at A 0.03 < count at A 0.01. [70%]
  Q4  At A 0.03 the phase matters: AT_90's count over the four phases (of 8 each) spans at least 3. [50%]
  Q5  AT_90 dominates in more seasonal cells than PS and than PSS. [70%]
  Q6  The per-day oracle OR dominates in at least as many seasonal cells as AT_90. [55%]
  Q7  AT_60's km / B is at least 1.0 in at least 86 of the 96 seasonal cells (90%; 6zx 53 of 56 = 95%). [65%]
Descriptive: per shape (A, phi) the dominance count of every rule (of 8), per cell km/B and ex/B for AT_60,
  AT_90, OR, PS; the AT_60 estimator's day-of-year tracking (mean eff_hat by quarter against mean true eff).

Run (from research/marine-hull): PYTHONPATH=src python3 experiments/run_seasonal_bias.py > experiments/results_seasonal_bias.txt
(stdlib, deterministic; uses up to 4 processes)"""
import math
import os
import sys
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import run_blend_transfer as bt  # noqa: E402
import run_fresh_years as fy  # noqa: E402
import run_pack_hotel_tau as pt  # noqa: E402
import run_season_week as sw  # noqa: E402
import run_self_bias as sb  # noqa: E402
import run_year_pack as yp  # noqa: E402

PACKS, HOTEL, BASE, PS, PSS = fy.PACKS, fy.HOTEL, fy.BASE, fy.PS, fy.PSS
HALVES, YEARS, WINDOWS = fy.HALVES, fy.YEARS, fy.WINDOWS
AMPS = (0.01, 0.02, 0.03)
PHASES = (0, 91, 182, 274)
SHAPES = ((0.0, 0),) + tuple((a, f) for a in AMPS for f in PHASES)
RULES = ("AT_30", "AT_60", "AT_90", "OR", "PS", "PSS")
QUARTERS = ((0, 90), (90, 181), (181, 273), (273, 366))


def scale(d, amp, phi):
    """Seasonal bias multiplier on day-of-year d (0 = 1 January)."""
    return 1.0 + amp * math.cos(2.0 * math.pi * (d - phi) / 365.25)


def score(key):
    """((cap, point, year, amp, phi), {rule: (km, excess dark h, tau-days)}, per-quarter (sum eff_hat, sum eff, n))."""
    cap, p, yr, amp, phi = key
    sun, h = fy._sun(p, yr)
    h = list(h)
    clim = fy._clim(p, yr)
    sd = [scale(d, amp, phi) for d in range(len(h))]
    hc = [s * x for s, x in zip(sd, clim)]
    T = pt.target(hc, cap, HOTEL)
    idle_dark = yp.idle(sun, cap, HOTEL)[1]
    b = sw.run(sun, T, hc, *sw.BASE, cap, HOTEL)
    out = {BASE: (b["km"], b["dark"] - idle_dark, None)}
    a = PS[cap][0]
    ones = [1.0] * len(h)
    r = {n: sb.ratios(h, hc, n) for n in WINDOWS}
    real = fy.REALISED[fy.half_of(yr)]
    eff = [s / real for s in sd]
    plans = {f"AT_{n}": [sb.tau_of(1.0 / x) for x in r[n]] for n in WINDOWS}
    plans["OR"] = [sb.tau_of(e) for e in eff]
    plans["PS"] = [PS[cap][1]] * len(h)
    plans["PSS"] = [PSS[cap][1]] * len(h)
    for name, taus in plans.items():
        km, dark, days = sb.run(h, T, hc, a, taus, ones, cap, HOTEL)
        out[name] = (km, dark - idle_dark, days)
    track = []
    for lo, hi in QUARTERS:
        hi = min(hi, len(h))
        track.append((sum(1.0 / x for x in r[sb.PRIMARY][lo:hi]), sum(eff[lo:hi]), hi - lo))
    return key, out, track


def evaluate(points=bt.PTS, procs=4):
    fy.prepare()
    keys = [(c, p, yr, a, f) for p in points for yr in YEARS for c in PACKS for a, f in SHAPES]
    with Pool(procs) as pool:
        res = pool.map(score, keys, chunksize=7)
    return {k: o for k, o, _ in res}, {k: t for k, _, t in res}


def cells_of(cells, points=bt.PTS):
    return {(a, f, hn, c): sb.total(cells, [(c, p, yr, a, f) for p in points for yr in yrs])
            for a, f in SHAPES for hn, yrs in HALVES.items() for c in PACKS}


def counts(C, rules=RULES):
    """{shape: {rule: cells dominated of 8}}."""
    return {(a, f): {g: sum(sb.dominates(C[(a, f, hn, c)], g) for hn in HALVES for c in PACKS) for g in rules}
            for a, f in SHAPES}


def main():
    cells, track = evaluate()
    C = cells_of(cells)
    yn = lambda x: "y" if x else "n"  # noqa: E731
    print("Milestone 6zy: 6zw's adaptive rule under a seasonal climatology bias, 2005 to 2014 (50 W payload)")
    print(f"climatology {fy.CLIM_YEARS[0]} to {fy.CLIM_YEARS[-1]} x s(d) = 1 + A cos(2 pi (d - phi) / 365.25); "
          f"A in {AMPS}, phi in {PHASES} days; reference A = 0")
    print("realised / unscaled climatology: " + ", ".join(f"{hn} {fy.REALISED[hn]:.4f}" for hn in HALVES))

    print("\nAT_60 estimator tracking by quarter (pack 2.5 kWh, all points x years): mean eff_hat vs mean true eff")
    for a, f in SHAPES:
        parts = []
        for q in range(len(QUARTERS)):
            ks = [(PACKS[0], p, yr, a, f) for p in bt.PTS for yr in YEARS]
            eh = sum(track[k][q][0] for k in ks)
            et = sum(track[k][q][1] for k in ks)
            n = sum(track[k][q][2] for k in ks)
            parts.append(f"Q{q + 1} {eh / n:.4f}/{et / n:.4f}")
        print(f"   A {a:4.2f} phi {f:3d}: " + "  ".join(parts))

    show = ("AT_60", "AT_90", "OR", "PS")
    print("\nPer cell (A, phi, half, pack): km/B ex/B dominates, for " + ", ".join(show))
    print("     A phi half C kWh | " + " | ".join(f"{g:>5s} km/B ex/B d" for g in show))
    for a, f in SHAPES:
        for hn in HALVES:
            for c in PACKS:
                t = C[(a, f, hn, c)]
                bb = t[BASE]
                parts = [f"{t[g][0] / bb[0]:10.4f} {bt.ratio(t[g][1], bb[1]):4.2f} {yn(sb.dominates(t, g))}"
                         for g in show]
                print(f"  {a:4.2f} {f:3d} {hn:4s} {c / 1000:5.1f} | " + " | ".join(parts))

    cnt = counts(C)
    print("\nDominance counts per shape (of 8 half x pack cells)")
    print("     A phi | " + " | ".join(f"{g:>5s}" for g in RULES))
    for a, f in SHAPES:
        print(f"  {a:4.2f} {f:3d} | " + " | ".join(f"{cnt[(a, f)][g]:5d}" for g in RULES))
    seas = [s for s in SHAPES if s[0] > 0]
    tot = {g: sum(cnt[s][g] for s in seas) for g in RULES}
    print("  seasonal | " + " | ".join(f"{tot[g]:5d}" for g in RULES) + "   (of 96)")
    by_amp = {a: {g: sum(cnt[(a, f)][g] for f in PHASES) for g in RULES} for a in AMPS}
    for a in AMPS:
        print(f"  A {a:4.2f}   | " + " | ".join(f"{by_amp[a][g]:5d}" for g in RULES) + "   (of 32)")

    print("\nPredictions")
    print(f"Q1 AT_90 dominates in >= 72 of 96: {'held' if tot['AT_90'] >= 72 else 'refuted'} ({tot['AT_90']} of 96)")
    print(f"Q2 AT_30 >= AT_90: {'held' if tot['AT_30'] >= tot['AT_90'] else 'refuted'} "
          f"(AT_30 {tot['AT_30']}, AT_60 {tot['AT_60']}, AT_90 {tot['AT_90']})")
    lo, hi = by_amp[AMPS[0]]["AT_90"], by_amp[AMPS[-1]]["AT_90"]
    print(f"Q3 AT_90 count at A 0.03 < at A 0.01: {'held' if hi < lo else 'refuted'} ({hi} vs {lo}, of 32)")
    ph = [cnt[(AMPS[-1], f)]["AT_90"] for f in PHASES]
    print(f"Q4 AT_90 span over phases at A 0.03 >= 3: {'held' if max(ph) - min(ph) >= 3 else 'refuted'} ({ph})")
    ok5 = tot["AT_90"] > tot["PS"] and tot["AT_90"] > tot["PSS"]
    print(f"Q5 AT_90 > PS and > PSS: {'held' if ok5 else 'refuted'} "
          f"(AT_90 {tot['AT_90']}, PS {tot['PS']}, PSS {tot['PSS']})")
    print(f"Q6 OR >= AT_90: {'held' if tot['OR'] >= tot['AT_90'] else 'refuted'} (OR {tot['OR']}, AT_90 {tot['AT_90']})")
    km = [C[(a, f, hn, c)]["AT_60"][0] / C[(a, f, hn, c)][BASE][0] for a, f in seas for hn in HALVES for c in PACKS]
    n7 = sum(x >= 1.0 for x in km)
    print(f"Q7 AT_60 km/B >= 1.0 in >= 86 of 96: {'held' if n7 >= 86 else 'refuted'} ({n7} of 96; min {min(km):.4f})")


if __name__ == "__main__":
    main()
