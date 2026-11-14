"""Milestone 6zz: does 6zw's adaptive feedback rule hold when the climatology is wrong on average and by season?

Why: 6zy's first two "Next" items. 6zy found a zero-mean seasonal bias (climatology x (1 + A cos)) up to 3% a
weak stress: every rule kept winning in most cells, and what hurt the rules in 6zv to 6zx was the climatology's
mean error. A real climatology can carry both at once, and a trailing ratio that lags the season by about N / 2
days could misread the mean during the swing, so the two errors may compound rather than add. 6zy also assumed
its cosine; it never measured how large the seasonal error of a real climatology is on these points.

Design (fixed here, before any configuration below was run):
  Part S (sweep). Data and split exactly as 6zx and 6zy: NASA POWER daily ALLSKY_SFC_SW_DWN 2005 to 2014 at the
  30 points (experiments/data/sun_30pts_2005_2014.json), climatology from all ten of 2015 to 2024, scored halves
  "E" 2005 to 2009 and "L" 2010 to 2014. 50 W payload, packs 2.5, 5, 10, 20 kWh, launched full each 1 January.
  Bias: the climatology every rule uses (estimate term K and the 45-day-lead target, B included; B rerun) is
  multiplied, day by day, by s(d) = s0 (1 + A cos(2 pi (d - phi) / 365.25)), d the day of the year from 0 on
  1 January. s0 in {0.97, 0.98, 1.02, 1.03} (6zx's sweep ends, where rules were weakest), A = 0.03 (6zy's
  largest), phi in {0, 91, 182, 274} days. 16 combined shapes x 2 halves x 4 packs = 128 combined cells, plus
  flat references A = 0 at each s0 (32 cells; these are 6zx's cells at s = s0 and must reproduce them).
  "Dominates B" = cell km >= B's and cell excess dark hours (over an idle boat's) <= B's, as 6zv to 6zy.
  Frozen, unchanged: weights a = PS's per pack; the tau table 60 / 30 / 20 / 10 at eff < 0.985 / 1.015 /
  1.025 / above (6zv); the ratio with a 14-day prior at ratio 1 (6zw); PS's and PSS's fixed taus.
  Rules: AT_30, AT_60, AT_90 (6zw's rule); OR (per-day oracle: tau from s(d) / realised for that half; not
  available to a boat); PS; PSS.
  Part M (measured seasonal error, no rule is run). Per point, over all of 2005 to 2014: the monthly ratio
  r_m = sum harvest in month m / sum unscaled climatology in month m, normalised by its 12-month mean; the
  first-harmonic amplitude A_hat = sqrt(a1^2 + b1^2), a1, b1 = (2 / 12) sum (r_m - 1) (cos, sin)(2 pi (m + 0.5) / 12),
  and the peak day. Also each point's mean ratio (its mean bias) and the largest monthly |r_m - 1|.
Predictions (priors in brackets):
  R1  AT_90 dominates B in at least 96 of the 128 combined cells (75%). [60%]
  R2  The combination costs AT_90 at most 12 cells against the flat references: combined count >= 4 x (flat
      count summed over s0) - 12. [55%]
  R3  AT_90 dominates in more combined cells than PS and than PSS. [75%]
  R4  The window ordering holds on the combined cells: AT_90 >= AT_60 >= AT_30. [60%]
  R5  Phase matters at the optimistic end: at s0 1.03 AT_90's count over the four phases (of 8 each) spans at
      least 2. [40%]
  R6  The per-day oracle OR dominates in at least as many combined cells as AT_90. [50%]
  R7  AT_60's km / B is at least 1.0 in at least 115 of the 128 combined cells (90%). [60%]
  M1  The median over the 30 points of A_hat is below 0.03, inside 6zy's swept range. [65%]
  M2  A_hat exceeds 0.03 at fewer than 10 of the 30 points. [60%]
Descriptive: per shape (s0, phi) the dominance count of every rule (of 8); per cell km/B and ex/B for AT_60,
  AT_90, OR, PS; per point A_hat, peak day, mean ratio and max monthly |r_m - 1|; A_hat by region.

Run (from research/marine-hull): PYTHONPATH=src python3 experiments/run_mean_seasonal_bias.py > experiments/results_mean_seasonal_bias.txt
(stdlib, deterministic; uses up to 4 processes)"""
import math
import os
import statistics as st
import sys
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import run_blend_transfer as bt  # noqa: E402
import run_fresh_years as fy  # noqa: E402
import run_pack_hotel_tau as pt  # noqa: E402
import run_reserve_curve as rc  # noqa: E402
import run_season_week as sw  # noqa: E402
import run_self_bias as sb  # noqa: E402
import run_year_pack as yp  # noqa: E402

PACKS, HOTEL, BASE, PS, PSS = fy.PACKS, fy.HOTEL, fy.BASE, fy.PS, fy.PSS
HALVES, YEARS, WINDOWS = fy.HALVES, fy.YEARS, fy.WINDOWS
MEANS = (0.97, 0.98, 1.02, 1.03)
AMP = 0.03
PHASES = (0, 91, 182, 274)
SHAPES = tuple((s0, 0.0, 0) for s0 in MEANS) + tuple((s0, AMP, f) for s0 in MEANS for f in PHASES)
RULES = ("AT_30", "AT_60", "AT_90", "OR", "PS", "PSS")
A_LINE = 0.03


def scale(d, s0, amp, phi):
    """Mean-plus-seasonal bias multiplier on day-of-year d (0 = 1 January)."""
    return s0 * (1.0 + amp * math.cos(2.0 * math.pi * (d - phi) / 365.25))


def score(key):
    """((cap, point, year, s0, amp, phi), {rule: (km, excess dark h, tau-days)})."""
    cap, p, yr, s0, amp, phi = key
    sun, h = fy._sun(p, yr)
    h = list(h)
    clim = fy._clim(p, yr)
    sd = [scale(d, s0, amp, phi) for d in range(len(h))]
    hc = [s * x for s, x in zip(sd, clim)]
    T = pt.target(hc, cap, HOTEL)
    idle_dark = yp.idle(sun, cap, HOTEL)[1]
    b = sw.run(sun, T, hc, *sw.BASE, cap, HOTEL)
    out = {BASE: (b["km"], b["dark"] - idle_dark, None)}
    a = PS[cap][0]
    ones = [1.0] * len(h)
    r = {n: sb.ratios(h, hc, n) for n in WINDOWS}
    real = fy.REALISED[fy.half_of(yr)]
    plans = {f"AT_{n}": [sb.tau_of(1.0 / x) for x in r[n]] for n in WINDOWS}
    plans["OR"] = [sb.tau_of(s / real) for s in sd]
    plans["PS"] = [PS[cap][1]] * len(h)
    plans["PSS"] = [PSS[cap][1]] * len(h)
    for name, taus in plans.items():
        km, dark, days = sb.run(h, T, hc, a, taus, ones, cap, HOTEL)
        out[name] = (km, dark - idle_dark, days)
    return key, out


def evaluate(points=bt.PTS, procs=4):
    fy.prepare()
    keys = [(c, p, yr) + sh for p in points for yr in YEARS for c in PACKS for sh in SHAPES]
    with Pool(procs) as pool:
        res = pool.map(score, keys, chunksize=8)
    return dict(res)


def cells_of(cells, points=bt.PTS):
    return {sh + (hn, c): sb.total(cells, [(c, p, yr) + sh for p in points for yr in yrs])
            for sh in SHAPES for hn, yrs in HALVES.items() for c in PACKS}


def counts(C, rules=RULES):
    """{shape: {rule: cells dominated of 8}}."""
    return {sh: {g: sum(sb.dominates(C[sh + (hn, c)], g) for hn in HALVES for c in PACKS) for g in rules}
            for sh in SHAPES}


def monthly(p, years=YEARS):
    """Per point: 12 monthly ratios harvest / unscaled climatology over `years` (not normalised)."""
    hs, cs = [0.0] * 12, [0.0] * 12
    for yr in years:
        h = fy._sun(p, yr)[1]
        c = fy._clim(p, yr)
        for d, x, y in zip(rc.dates(yr), h, c):
            hs[d.month - 1] += x
            cs[d.month - 1] += y
    return [x / y for x, y in zip(hs, cs)], sum(hs) / sum(cs)


def harmonic(rm):
    """(A_hat, peak day of year) of the first harmonic of ratios rm normalised by their mean."""
    m = st.fmean(rm)
    z = [x / m - 1.0 for x in rm]
    a1 = 2.0 / 12 * sum(v * math.cos(2 * math.pi * (i + 0.5) / 12) for i, v in enumerate(z))
    b1 = 2.0 / 12 * sum(v * math.sin(2 * math.pi * (i + 0.5) / 12) for i, v in enumerate(z))
    peak = (math.atan2(b1, a1) / (2 * math.pi) * 365.25) % 365.25
    return math.hypot(a1, b1), peak


def measured(points=bt.PTS):
    """{point: (A_hat, peak day, mean ratio, max monthly |r_m / mean - 1|)}."""
    fy.prepare()
    out = {}
    for p in points:
        rm, mean = monthly(p)
        amp, peak = harmonic(rm)
        m = st.fmean(rm)
        out[p] = (amp, peak, mean, max(abs(x / m - 1.0) for x in rm))
    return out


def main():
    cells = evaluate()
    C = cells_of(cells)
    yn = lambda x: "y" if x else "n"  # noqa: E731
    print("Milestone 6zz: 6zw's adaptive rule under a mean plus seasonal climatology bias, 2005 to 2014 (50 W)")
    print(f"climatology {fy.CLIM_YEARS[0]} to {fy.CLIM_YEARS[-1]} x s(d) = s0 (1 + A cos(2 pi (d - phi) / 365.25)); "
          f"s0 in {MEANS}, A {AMP}, phi in {PHASES} days; flat references A = 0")
    print("realised / unscaled climatology: " + ", ".join(f"{hn} {fy.REALISED[hn]:.4f}" for hn in HALVES))

    show = ("AT_60", "AT_90", "OR", "PS")
    print("\nPer cell (s0, A, phi, half, pack): km/B ex/B dominates, for " + ", ".join(show))
    print("    s0    A phi half C kWh | " + " | ".join(f"{g:>5s} km/B ex/B d" for g in show))
    for sh in SHAPES:
        for hn in HALVES:
            for c in PACKS:
                t = C[sh + (hn, c)]
                bb = t[BASE]
                parts = [f"{t[g][0] / bb[0]:10.4f} {bt.ratio(t[g][1], bb[1]):4.2f} {yn(sb.dominates(t, g))}"
                         for g in show]
                print(f"  {sh[0]:4.2f} {sh[1]:4.2f} {sh[2]:3d} {hn:4s} {c / 1000:5.1f} | " + " | ".join(parts))

    cnt = counts(C)
    print("\nDominance counts per shape (of 8 half x pack cells)")
    print("    s0    A phi | " + " | ".join(f"{g:>5s}" for g in RULES))
    for sh in SHAPES:
        print(f"  {sh[0]:4.2f} {sh[1]:4.2f} {sh[2]:3d} | " + " | ".join(f"{cnt[sh][g]:5d}" for g in RULES))
    comb = [sh for sh in SHAPES if sh[1] > 0]
    flat = [sh for sh in SHAPES if sh[1] == 0]
    tot = {g: sum(cnt[sh][g] for sh in comb) for g in RULES}
    ftot = {g: sum(cnt[sh][g] for sh in flat) for g in RULES}
    print("  combined       | " + " | ".join(f"{tot[g]:5d}" for g in RULES) + "   (of 128)")
    print("  flat x 4       | " + " | ".join(f"{4 * ftot[g]:5d}" for g in RULES) + "   (of 128, 4 x the 32 flat cells)")
    by_s0 = {s0: {g: sum(cnt[(s0, AMP, f)][g] for f in PHASES) for g in RULES} for s0 in MEANS}
    for s0 in MEANS:
        print(f"  s0 {s0:4.2f} comb  | " + " | ".join(f"{by_s0[s0][g]:5d}" for g in RULES)
              + f"   (of 32; flat x 4: AT_90 {4 * cnt[(s0, 0.0, 0)]['AT_90']})")

    M = measured()
    print("\nPart M: measured seasonal error of the 2015 to 2024 climatology on 2005 to 2014 (no rule run)")
    print("  point             A_hat  peak day  mean ratio  max |r_m - 1|")
    for p in bt.PTS:
        a, pk, mr, mx = M[p]
        print(f"  {p:16s} {a:6.4f}  {pk:8.0f}  {mr:10.4f}  {mx:13.4f}")
    for name, pts in fy.REGIONS.items():
        amps = [M[p][0] for p in pts]
        print(f"  {name:9s} median A_hat {st.median(amps):.4f}, max {max(amps):.4f}, n {len(amps)}")
    amps = [M[p][0] for p in bt.PTS]
    med, n_over = st.median(amps), sum(a > A_LINE for a in amps)

    print("\nPredictions")
    print(f"R1 AT_90 dominates in >= 96 of 128: {'held' if tot['AT_90'] >= 96 else 'refuted'} ({tot['AT_90']} of 128)")
    ok2 = tot["AT_90"] >= 4 * ftot["AT_90"] - 12
    print(f"R2 AT_90 combined >= 4 x flat - 12: {'held' if ok2 else 'refuted'} "
          f"({tot['AT_90']} vs 4 x {ftot['AT_90']} - 12 = {4 * ftot['AT_90'] - 12})")
    ok3 = tot["AT_90"] > tot["PS"] and tot["AT_90"] > tot["PSS"]
    print(f"R3 AT_90 > PS and > PSS: {'held' if ok3 else 'refuted'} "
          f"(AT_90 {tot['AT_90']}, PS {tot['PS']}, PSS {tot['PSS']})")
    ok4 = tot["AT_90"] >= tot["AT_60"] >= tot["AT_30"]
    print(f"R4 AT_90 >= AT_60 >= AT_30: {'held' if ok4 else 'refuted'} "
          f"(AT_30 {tot['AT_30']}, AT_60 {tot['AT_60']}, AT_90 {tot['AT_90']})")
    ph = [cnt[(MEANS[-1], AMP, f)]["AT_90"] for f in PHASES]
    print(f"R5 AT_90 span over phases at s0 1.03 >= 2: {'held' if max(ph) - min(ph) >= 2 else 'refuted'} ({ph})")
    print(f"R6 OR >= AT_90: {'held' if tot['OR'] >= tot['AT_90'] else 'refuted'} (OR {tot['OR']}, AT_90 {tot['AT_90']})")
    km = [C[sh + (hn, c)]["AT_60"][0] / C[sh + (hn, c)][BASE][0] for sh in comb for hn in HALVES for c in PACKS]
    n7 = sum(x >= 1.0 for x in km)
    print(f"R7 AT_60 km/B >= 1.0 in >= 115 of 128: {'held' if n7 >= 115 else 'refuted'} ({n7} of 128; min {min(km):.4f})")
    print(f"M1 median A_hat < 0.03: {'held' if med < A_LINE else 'refuted'} (median {med:.4f})")
    print(f"M2 A_hat > 0.03 at < 10 of 30 points: {'held' if n_over < 10 else 'refuted'} ({n_over} of 30)")


if __name__ == "__main__":
    main()
