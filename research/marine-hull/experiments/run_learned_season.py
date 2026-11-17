"""Milestone 6zza: can the boat learn its climatology's seasonal error from its own earlier years and close the gap to the per-day oracle?

Why: 6zz's first "Next". Under a mean plus seasonal climatology bias, 6zw's adaptive rule AT_90 dominated the
7-day trailing-mean baseline B in 104 of 128 cells, against 120 for a per-day oracle OR that knows the bias
day by day. 6zz read that gap (16 cells) as the value of knowing the seasonal shape, and measured a real
seasonal error of 1.8% median amplitude that rises to 4.5 to 8.5% above 50 degrees. A boat on a repeat
deployment has its own earlier harvest: a month-by-month harvest / climatology ratio from earlier years could
scale the climatology before the rule uses it.

Design (fixed here, before any configuration below was run):
  Data and split exactly as 6zx to 6zz: NASA POWER daily ALLSKY_SFC_SW_DWN 2005 to 2014 at the 30 points,
  climatology from all ten of 2015 to 2024, halves "E" 2005 to 2009 and "L" 2010 to 2014. 50 W payload, packs
  2.5, 5, 10, 20 kWh, launched full each 1 January. Shapes: 6zz's 20 (s0 in {0.97, 0.98, 1.02, 1.03} flat, and
  x (1 + 0.03 cos(2 pi (d - phi) / 365.25)), phi in {0, 91, 182, 274}) plus the real shape (s = 1, no added
  bias: only the climatology's own error). 21 shapes x 2 halves x 4 packs = 168 cells.
  Learn / score: a cell scored on half H learns from the other half H' only (5 years learn, 5 years score,
  both ways). Per point and shape, the learned monthly ratio c_m = sum harvest in month m over H' / sum of the
  shape-scaled climatology in month m over H', clamped to [0.85, 1.15]; c(d) linearly interpolated between
  month mid-points (m + 0.5) x 365.25 / 12, circular. The mean-only correction is one number per point and
  shape: sum harvest / sum scaled climatology over H'. The corrected climatology c(d) x hc(d) replaces hc
  everywhere the rule uses it: the K term, the 45-day-lead target (rebuilt) and the AT ratio's denominator.
  B is not corrected (it is the baseline a boat without history flies) and is rerun with the scaled climatology.
  "Dominates B" = cell km >= B's and cell excess dark hours (over an idle boat's) <= B's, as 6zv to 6zz.
  Frozen, unchanged: weights a = PS's per pack; the tau table; the 14-day prior; PS's fixed taus.
  Rules: AT_90, OR, PS (uncorrected; must reproduce 6zz's cells, a test checks this); LC_90 (AT_90 on the
  monthly-corrected climatology); LM_90 (AT_90 on the mean-corrected climatology); LCP (PS's fixed tau on the
  monthly-corrected climatology: does the correction alone replace adaptation?).
  High-amplitude subset: the points with 6zz's measured A_hat > 0.03 (9 of 30; that selection used all ten
  years, disclosed), cells summed over those points only.
Predictions (priors in brackets):
  L1  LC_90 dominates B in at least 104 of the 128 combined cells (AT_90's count in 6zz). [55%]
  L2  LC_90 closes at least half of AT_90's gap to OR on the combined cells: >= 112 of 128. [35%]
  L3  LC_90 dominates in at least as many combined cells as LM_90 (the seasonal shape adds to the mean). [55%]
  L4  On the real shape (8 cells, all points) LC_90 dominates in at least 7 of 8. [60%]
  L5  On the real shape over the high-amplitude points (8 cells) LC_90 dominates in at least as many as AT_90. [55%]
  L6  LCP dominates in more combined cells than PS. [70%]
  L7  LC_90's km / B is at least 1.0 in at least 150 of the 168 cells. [55%]
Descriptive: per shape the dominance count of every rule (of 8); per cell km/B and ex/B for AT_90, LC_90,
  LM_90, LCP; per point the learned c_m's spread and how many months hit the clamp.

Run (from research/marine-hull): PYTHONPATH=src python3 experiments/run_learned_season.py > experiments/results_learned_season.txt
(stdlib, deterministic; uses up to 4 processes)"""
import math
import os
import statistics as st
import sys
from functools import lru_cache
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import run_blend_transfer as bt  # noqa: E402
import run_fresh_years as fy  # noqa: E402
import run_mean_seasonal_bias as ms  # noqa: E402
import run_pack_hotel_tau as pt  # noqa: E402
import run_reserve_curve as rc  # noqa: E402
import run_season_week as sw  # noqa: E402
import run_self_bias as sb  # noqa: E402
import run_year_pack as yp  # noqa: E402

PACKS, HOTEL, BASE, PS = fy.PACKS, fy.HOTEL, fy.BASE, fy.PS
HALVES, YEARS = fy.HALVES, fy.YEARS
REAL = (1.0, 0.0, 0)
SHAPES = (REAL,) + ms.SHAPES
COMBINED = tuple(sh for sh in SHAPES if sh[1] > 0)
RULES = ("AT_90", "OR", "PS", "LC_90", "LM_90", "LCP")
CLAMP = (0.85, 1.15)
N = 90


def other(hn):
    return "L" if hn == "E" else "E"


def scaled(p, yr, shape):
    s0, amp, phi = shape
    clim = fy._clim(p, yr)
    sd = [ms.scale(d, s0, amp, phi) for d in range(len(clim))]
    return sd, [s * x for s, x in zip(sd, clim)]


@lru_cache(maxsize=None)
def learned(p, hn, shape):
    """(12 clamped monthly ratios, mean ratio, months clamped) learned on half hn's years."""
    hs, cs = [0.0] * 12, [0.0] * 12
    for yr in HALVES[hn]:
        h = fy._sun(p, yr)[1]
        hc = scaled(p, yr, shape)[1]
        for d, x, y in zip(rc.dates(yr), h, hc):
            hs[d.month - 1] += x
            cs[d.month - 1] += y
    raw = [x / y for x, y in zip(hs, cs)]
    cm = [min(CLAMP[1], max(CLAMP[0], r)) for r in raw]
    return tuple(cm), sum(hs) / sum(cs), sum(r != c for r, c in zip(raw, cm))


def interp(cm, d):
    """c(d): linear between month mid-points (m + 0.5) x 365.25 / 12, circular."""
    x = d / 365.25 * 12 - 0.5
    i = math.floor(x)
    f = x - i
    return cm[i % 12] * (1.0 - f) + cm[(i + 1) % 12] * f


def score(key):
    """((cap, point, year, s0, amp, phi), {rule: (km, excess dark h, tau-days)})."""
    cap, p, yr, s0, amp, phi = key
    shape = (s0, amp, phi)
    sun, h = fy._sun(p, yr)
    h = list(h)
    sd, hc = scaled(p, yr, shape)
    T = pt.target(hc, cap, HOTEL)
    idle_dark = yp.idle(sun, cap, HOTEL)[1]
    b = sw.run(sun, T, hc, *sw.BASE, cap, HOTEL)
    out = {BASE: (b["km"], b["dark"] - idle_dark, None)}
    a = PS[cap][0]
    ones = [1.0] * len(h)
    real = fy.REALISED[fy.half_of(yr)]
    r = sb.ratios(h, hc, N)
    runs = {"AT_90": (T, hc, [sb.tau_of(1.0 / x) for x in r]),
            "OR": (T, hc, [sb.tau_of(s / real) for s in sd]),
            "PS": (T, hc, [PS[cap][1]] * len(h))}
    cm, mean, _ = learned(p, other(fy.half_of(yr)), shape)
    hm = [interp(cm, d) * x for d, x in enumerate(hc)]
    hl = [mean * x for x in hc]
    Tm, Tl = pt.target(hm, cap, HOTEL), pt.target(hl, cap, HOTEL)
    runs["LC_90"] = (Tm, hm, [sb.tau_of(1.0 / x) for x in sb.ratios(h, hm, N)])
    runs["LM_90"] = (Tl, hl, [sb.tau_of(1.0 / x) for x in sb.ratios(h, hl, N)])
    runs["LCP"] = (Tm, hm, [PS[cap][1]] * len(h))
    for name, (TT, cc, taus) in runs.items():
        km, dark, days = sb.run(h, TT, cc, a, taus, ones, cap, HOTEL)
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
    return {sh: {g: sum(sb.dominates(C[sh + (hn, c)], g) for hn in HALVES for c in PACKS) for g in rules}
            for sh in SHAPES}


def high_amp_points():
    M = ms.measured()
    return tuple(p for p in bt.PTS if M[p][0] > ms.A_LINE)


def main():
    cells = evaluate()
    C = cells_of(cells)
    hi = high_amp_points()
    CH = cells_of(cells, hi)
    yn = lambda x: "y" if x else "n"  # noqa: E731
    print("Milestone 6zza: a seasonal correction learned from the boat's own earlier years, 2005 to 2014 (50 W)")
    print(f"climatology {fy.CLIM_YEARS[0]} to {fy.CLIM_YEARS[-1]} x s(d); learn on one half, score the other; "
          f"monthly ratio clamped to {CLAMP}, interpolated between month mid-points")
    print("realised / unscaled climatology: " + ", ".join(f"{hn} {fy.REALISED[hn]:.4f}" for hn in HALVES))
    print(f"high-amplitude points (6zz A_hat > {ms.A_LINE}): {', '.join(hi)} ({len(hi)})")

    print("\nLearned monthly ratios on the real shape (learned on each half): min, max, mean |c_m - 1|, clamped months")
    for p in bt.PTS:
        parts = []
        for hn in HALVES:
            cm, mean, ncl = learned(p, hn, REAL)
            parts.append(f"{hn}: {min(cm):.3f} {max(cm):.3f} {st.fmean(abs(x - 1) for x in cm):.3f} "
                         f"mean {mean:.4f} clamp {ncl}")
        print(f"  {p:16s} " + " | ".join(parts))
    ncl = sum(learned(p, hn, sh)[2] for p in bt.PTS for hn in HALVES for sh in SHAPES)
    print(f"  clamped months over every point, half and shape: {ncl} of {30 * 2 * len(SHAPES) * 12}")

    show = ("AT_90", "LC_90", "LM_90", "LCP")
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
    print("\nDominance counts per shape (of 8 half x pack cells), all 30 points")
    print("    s0    A phi | " + " | ".join(f"{g:>5s}" for g in RULES))
    for sh in SHAPES:
        print(f"  {sh[0]:4.2f} {sh[1]:4.2f} {sh[2]:3d} | " + " | ".join(f"{cnt[sh][g]:5d}" for g in RULES))
    tot = {g: sum(cnt[sh][g] for sh in COMBINED) for g in RULES}
    flat = {g: sum(cnt[sh][g] for sh in SHAPES if sh[1] == 0 and sh != REAL) for g in RULES}
    allc = {g: sum(cnt[sh][g] for sh in SHAPES) for g in RULES}
    print("  combined       | " + " | ".join(f"{tot[g]:5d}" for g in RULES) + "   (of 128)")
    print("  flat s0        | " + " | ".join(f"{flat[g]:5d}" for g in RULES) + "   (of 32)")
    print("  all shapes     | " + " | ".join(f"{allc[g]:5d}" for g in RULES) + "   (of 168)")
    for s0 in ms.MEANS:
        bs0 = {g: sum(cnt[(s0, ms.AMP, f)][g] for f in ms.PHASES) for g in RULES}
        print(f"  s0 {s0:4.2f} comb  | " + " | ".join(f"{bs0[g]:5d}" for g in RULES) + "   (of 32)")

    ch = counts(CH)
    print(f"\nHigh-amplitude points only ({len(hi)}): dominance counts per shape (of 8)")
    print("    s0    A phi | " + " | ".join(f"{g:>5s}" for g in RULES))
    for sh in SHAPES:
        print(f"  {sh[0]:4.2f} {sh[1]:4.2f} {sh[2]:3d} | " + " | ".join(f"{ch[sh][g]:5d}" for g in RULES))
    htot = {g: sum(ch[sh][g] for sh in SHAPES) for g in RULES}
    print("  all shapes     | " + " | ".join(f"{htot[g]:5d}" for g in RULES) + "   (of 168)")
    print("  real shape, high-amplitude points, per cell: km/B ex/B for " + ", ".join(show))
    for hn in HALVES:
        for c in PACKS:
            t = CH[REAL + (hn, c)]
            bb = t[BASE]
            parts = [f"{t[g][0] / bb[0]:7.4f} {bt.ratio(t[g][1], bb[1]):4.2f} {yn(sb.dominates(t, g))}" for g in show]
            print(f"    {hn} {c / 1000:5.1f} | " + " | ".join(parts))

    print("\nPredictions")
    print(f"L1 LC_90 >= 104 of 128 combined: {'held' if tot['LC_90'] >= 104 else 'refuted'} "
          f"({tot['LC_90']}; AT_90 {tot['AT_90']}, OR {tot['OR']})")
    print(f"L2 LC_90 >= 112 of 128 combined: {'held' if tot['LC_90'] >= 112 else 'refuted'} ({tot['LC_90']})")
    print(f"L3 LC_90 >= LM_90 combined: {'held' if tot['LC_90'] >= tot['LM_90'] else 'refuted'} "
          f"(LC_90 {tot['LC_90']}, LM_90 {tot['LM_90']})")
    print(f"L4 LC_90 >= 7 of 8 on the real shape: {'held' if cnt[REAL]['LC_90'] >= 7 else 'refuted'} "
          f"({cnt[REAL]['LC_90']}; AT_90 {cnt[REAL]['AT_90']})")
    ok5 = ch[REAL]["LC_90"] >= ch[REAL]["AT_90"]
    print(f"L5 LC_90 >= AT_90 on the real shape, high-amplitude points: {'held' if ok5 else 'refuted'} "
          f"(LC_90 {ch[REAL]['LC_90']}, AT_90 {ch[REAL]['AT_90']} of 8)")
    print(f"L6 LCP > PS combined: {'held' if tot['LCP'] > tot['PS'] else 'refuted'} (LCP {tot['LCP']}, PS {tot['PS']})")
    km = [C[sh + (hn, c)]["LC_90"][0] / C[sh + (hn, c)][BASE][0] for sh in SHAPES for hn in HALVES for c in PACKS]
    n7 = sum(x >= 1.0 for x in km)
    print(f"L7 LC_90 km/B >= 1.0 in >= 150 of 168: {'held' if n7 >= 150 else 'refuted'} ({n7}; min {min(km):.4f})")


if __name__ == "__main__":
    main()
