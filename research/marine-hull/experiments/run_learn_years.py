"""Milestone 6zzb: how many earlier years does the boat need to learn its climatology's seasonal error?

Why: 6zza's first "Next". 6zza learned a month-by-month harvest / climatology ratio c_m from five earlier
years and scaled the climatology with it before 6zw's adaptive rule ran (LC_90). On the real shape (no added
bias, only the NASA POWER climatology's own error) at the nine high-amplitude points, LC_90 dominated the 7-day
baseline B in 5 of 8 cells against the uncorrected AT_90's 1, and LCP (the same correction with PS's fixed tau)
in 7 of 8. A designer needs to know whether one season of the boat's own log is enough, or whether five are.
With one year the monthly ratio also carries that year's weather, so the correction can learn noise.

Design (fixed here, before any configuration below was run):
  Data, split, payload, packs and shapes exactly as 6zza: NASA POWER daily ALLSKY_SFC_SW_DWN 2005 to 2014 at
  the 30 points, climatology from 2015 to 2024, halves "E" 2005 to 2009 and "L" 2010 to 2014, 50 W, packs 2.5,
  5, 10, 20 kWh, the real shape plus 6zz's 20 swept shapes, 168 cells.
  Learning years: a cell scored on half H learns from the k years of the other half nearest in time to H,
  k in {1, 2, 3, 5}: scoring L learns from 2009, 2008 to 2009, 2007 to 2009, 2005 to 2009; scoring E learns from
  2010, 2010 to 2011, 2010 to 2012, 2010 to 2014 (the E direction learns from later years, as 6zu's reverse
  split did). k = 5 is 6zza's LC_90 and LCP exactly (a test checks this). c_m, its clamp [0.85, 1.15] and the
  interpolation between month mid-points are 6zza's.
  Rules: B (uncorrected, as in 6zza), AT_90 (uncorrected), LC_k (AT_90 on the k-year corrected climatology),
  LCP_k (PS's fixed tau on it). Weights, tau table, prior and PS's taus frozen.
  "Dominates B" = cell km >= B's and cell excess dark hours <= B's, as 6zv to 6zza.
  High-amplitude subset: 6zza's nine points (6zz A_hat > 0.03; selected on all ten years, disclosed).
  Per-point cells (added for resolution, since the real shape gives only 8 pooled cells): one point, one half,
  one pack, summed over that half's five years; 240 on the real shape, 72 at the high-amplitude points.
Predictions (priors in brackets):
  K1  LC_1 dominates B on the real shape (8 pooled cells, all points) in at least 7 of 8. [60%]
  K2  On the real shape over the high-amplitude points, LC_1 dominates in at least as many of 8 as AT_90. [60%]
  K3  On the real shape over the high-amplitude points, LC_k's count is non-decreasing in k (k = 1, 2, 3, 5). [35%]
  K4  On the same cells LC_3 reaches at least 4 of 8 (within one of 6zza's 5). [50%]
  K5  LC_1 dominates in at least 104 of the 128 combined swept cells (AT_90's count). [55%]
  K6  LCP_1 dominates in at least 5 of 8 real-shape high-amplitude cells (6zza's LCP: 7). [45%]
  K7  LC_1's km / B is at least 1.0 in at least 150 of the 168 pooled cells. [55%]
  K8  Over the 72 per-point real-shape cells at the high-amplitude points, LC_1 dominates in more than AT_90. [55%]
Descriptive: per k the dominance counts of every rule on every shape group; per point the mean
  |c_m(k) - c_m(5)| and the clamped months; per-point real-shape counts at all 30 and the nine points.

Run (from research/marine-hull): PYTHONPATH=src python3 experiments/run_learn_years.py > experiments/results_learn_years.txt
(stdlib, deterministic; uses up to 4 processes)"""
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
import run_learned_season as ls  # noqa: E402
import run_mean_seasonal_bias as ms  # noqa: E402
import run_pack_hotel_tau as pt  # noqa: E402
import run_reserve_curve as rc  # noqa: E402
import run_season_week as sw  # noqa: E402
import run_self_bias as sb  # noqa: E402
import run_year_pack as yp  # noqa: E402

PACKS, HOTEL, BASE, PS = fy.PACKS, fy.HOTEL, fy.BASE, fy.PS
HALVES, YEARS = fy.HALVES, fy.YEARS
REAL, SHAPES, COMBINED, CLAMP, N = ls.REAL, ls.SHAPES, ls.COMBINED, ls.CLAMP, ls.N
KS = (1, 2, 3, 5)
RULES = ("AT_90",) + tuple(f"LC_{k}" for k in KS) + tuple(f"LCP_{k}" for k in KS)


def learn_years(scored_half, k):
    """The k years of the other half nearest in time to the scored half."""
    if scored_half == "L":
        return HALVES["E"][-k:]
    return HALVES["L"][:k]


@lru_cache(maxsize=None)
def learned(p, years, shape):
    """(12 clamped monthly ratios, months clamped) learned on the given years."""
    hs, cs = [0.0] * 12, [0.0] * 12
    for yr in years:
        h = fy._sun(p, yr)[1]
        hc = ls.scaled(p, yr, shape)[1]
        for d, x, y in zip(rc.dates(yr), h, hc):
            hs[d.month - 1] += x
            cs[d.month - 1] += y
    raw = [x / y for x, y in zip(hs, cs)]
    cm = [min(CLAMP[1], max(CLAMP[0], r)) for r in raw]
    return tuple(cm), sum(r != c for r, c in zip(raw, cm))


def score(key):
    """((cap, point, year, s0, amp, phi), {rule: (km, excess dark h, tau-days)})."""
    cap, p, yr, s0, amp, phi = key
    shape = (s0, amp, phi)
    sun, h = fy._sun(p, yr)
    h = list(h)
    hc = ls.scaled(p, yr, shape)[1]
    T = pt.target(hc, cap, HOTEL)
    idle_dark = yp.idle(sun, cap, HOTEL)[1]
    b = sw.run(sun, T, hc, *sw.BASE, cap, HOTEL)
    out = {BASE: (b["km"], b["dark"] - idle_dark, None)}
    a = PS[cap][0]
    ones = [1.0] * len(h)
    runs = {"AT_90": (T, hc, [sb.tau_of(1.0 / x) for x in sb.ratios(h, hc, N)])}
    hn = fy.half_of(yr)
    for k in KS:
        cm = learned(p, learn_years(hn, k), shape)[0]
        hm = [ls.interp(cm, d) * x for d, x in enumerate(hc)]
        Tm = pt.target(hm, cap, HOTEL)
        runs[f"LC_{k}"] = (Tm, hm, [sb.tau_of(1.0 / x) for x in sb.ratios(h, hm, N)])
        runs[f"LCP_{k}"] = (Tm, hm, [PS[cap][1]] * len(h))
    for name, (TT, cc, taus) in runs.items():
        km, dark, days = sb.run(h, TT, cc, a, taus, ones, cap, HOTEL)
        out[name] = (km, dark - idle_dark, days)
    return key, out


def evaluate(points=bt.PTS, shapes=SHAPES, procs=4):
    fy.prepare()
    keys = [(c, p, yr) + sh for p in points for yr in YEARS for c in PACKS for sh in shapes]
    with Pool(procs) as pool:
        res = pool.map(score, keys, chunksize=8)
    return dict(res)


def cells_of(cells, points=bt.PTS):
    return {sh + (hn, c): sb.total(cells, [(c, p, yr) + sh for p in points for yr in yrs])
            for sh in SHAPES for hn, yrs in HALVES.items() for c in PACKS}


def counts(C, rules=RULES):
    return {sh: {g: sum(sb.dominates(C[sh + (hn, c)], g) for hn in HALVES for c in PACKS) for g in rules}
            for sh in SHAPES}


def per_point(cells, points):
    """Real-shape dominance counts over (point, half, pack) cells, each summed over the half's years."""
    n = dict.fromkeys(RULES, 0)
    for p in points:
        for hn, yrs in HALVES.items():
            for c in PACKS:
                t = sb.total(cells, [(c, p, yr) + REAL for yr in yrs])
                for g in RULES:
                    n[g] += sb.dominates(t, g)
    return n


def main():
    cells = evaluate()
    C = cells_of(cells)
    hi = ls.high_amp_points()
    CH = cells_of(cells, hi)
    yn = lambda x: "y" if x else "n"  # noqa: E731
    print("Milestone 6zzb: how many earlier years the learned seasonal correction needs, 2005 to 2014 (50 W)")
    print(f"climatology {fy.CLIM_YEARS[0]} to {fy.CLIM_YEARS[-1]} x s(d); learn on the k years of the other half "
          f"nearest the scored half, k in {KS}; clamp {CLAMP}")
    for hn in HALVES:
        print(f"  scoring {hn}: " + "; ".join(f"k={k} {learn_years(hn, k)}" for k in KS))
    print(f"high-amplitude points (6zz A_hat > {ms.A_LINE}): {', '.join(hi)} ({len(hi)})")

    print("\nLearned monthly ratios on the real shape: mean |c_m(k) - c_m(5)| over months and halves, clamped months")
    print("  point            | " + " | ".join(f"k={k} dev  cl" for k in KS))
    devs = {k: [] for k in KS}
    for p in bt.PTS:
        parts = []
        for k in KS:
            d, ncl = [], 0
            for hn in HALVES:
                ck, nk = learned(p, learn_years(hn, k), REAL)
                c5 = learned(p, learn_years(hn, 5), REAL)[0]
                d += [abs(x - y) for x, y in zip(ck, c5)]
                ncl += nk
            devs[k].append(st.fmean(d))
            parts.append(f"{st.fmean(d):.4f} {ncl:3d}")
        print(f"  {p:16s} | " + " | ".join(parts))
    print("  median over points | " + " | ".join(f"{st.median(devs[k]):.4f}    " for k in KS))
    for k in KS:
        ncl = sum(learned(p, learn_years(hn, k), sh)[1] for p in bt.PTS for hn in HALVES for sh in SHAPES)
        print(f"  k={k}: clamped months over every point, half and shape: {ncl} of {30 * 2 * len(SHAPES) * 12}")

    cnt, ch = counts(C), counts(CH)
    groups = {"real (of 8)": (REAL,), "flat s0 (of 32)": tuple(sh for sh in SHAPES if sh[1] == 0 and sh != REAL),
              "combined (of 128)": COMBINED, "all (of 168)": SHAPES}
    print("\nDominance counts, all 30 points")
    print("  group              | " + " | ".join(f"{g:>6s}" for g in RULES))
    for name, shs in groups.items():
        print(f"  {name:18s} | " + " | ".join(f"{sum(cnt[sh][g] for sh in shs):6d}" for g in RULES))
    print(f"\nDominance counts, high-amplitude points only ({len(hi)})")
    print("  group              | " + " | ".join(f"{g:>6s}" for g in RULES))
    for name, shs in groups.items():
        print(f"  {name:18s} | " + " | ".join(f"{sum(ch[sh][g] for sh in shs):6d}" for g in RULES))

    show = ("AT_90",) + tuple(f"LC_{k}" for k in KS) + ("LCP_1", "LCP_5")
    for label, CC in (("all 30 points", C), (f"high-amplitude points ({len(hi)})", CH)):
        print(f"\nReal shape, {label}, per pooled cell: km/B ex/B dominates")
        print("  half  kWh | " + " | ".join(f"{g:>6s} km/B ex/B d" for g in show))
        for hn in HALVES:
            for c in PACKS:
                t = CC[REAL + (hn, c)]
                bb = t[BASE]
                parts = [f"{t[g][0] / bb[0]:11.4f} {bt.ratio(t[g][1], bb[1]):4.2f} {yn(sb.dominates(t, g))}"
                         for g in show]
                print(f"  {hn:4s} {c / 1000:4.1f} | " + " | ".join(parts))

    pp_all, pp_hi = per_point(cells, bt.PTS), per_point(cells, hi)
    print("\nPer-point real-shape cells (point x half x pack, summed over the half's five years): dominance counts")
    print("  set                | " + " | ".join(f"{g:>6s}" for g in RULES))
    print(f"  all 30 (of 240)    | " + " | ".join(f"{pp_all[g]:6d}" for g in RULES))
    print(f"  high-amp (of {8 * len(hi):3d})  | " + " | ".join(f"{pp_hi[g]:6d}" for g in RULES))

    kmr = {k: [C[sh + (hn, c)][f"LC_{k}"][0] / C[sh + (hn, c)][BASE][0]
               for sh in SHAPES for hn in HALVES for c in PACKS] for k in KS}
    print("\nLC_k km/B over the 168 pooled cells: n >= 1.0, min")
    for k in KS:
        print(f"  k={k}: {sum(x >= 1.0 for x in kmr[k])} {min(kmr[k]):.4f}")

    tot = {g: sum(cnt[sh][g] for sh in COMBINED) for g in RULES}
    hr = {g: ch[REAL][g] for g in RULES}
    print("\nPredictions")
    print(f"K1 LC_1 >= 7 of 8 on the real shape: {'held' if cnt[REAL]['LC_1'] >= 7 else 'refuted'} "
          f"({cnt[REAL]['LC_1']}; AT_90 {cnt[REAL]['AT_90']}, LC_5 {cnt[REAL]['LC_5']})")
    print(f"K2 LC_1 >= AT_90 on the real shape, high-amplitude points: "
          f"{'held' if hr['LC_1'] >= hr['AT_90'] else 'refuted'} (LC_1 {hr['LC_1']}, AT_90 {hr['AT_90']} of 8)")
    seq = [hr[f"LC_{k}"] for k in KS]
    mono = all(x <= y for x, y in zip(seq, seq[1:]))
    print(f"K3 LC_k non-decreasing in k, real shape, high-amplitude points: {'held' if mono else 'refuted'} "
          f"({' / '.join(map(str, seq))} for k = {' / '.join(map(str, KS))})")
    print(f"K4 LC_3 >= 4 of 8 there: {'held' if hr['LC_3'] >= 4 else 'refuted'} ({hr['LC_3']})")
    print(f"K5 LC_1 >= 104 of 128 combined: {'held' if tot['LC_1'] >= 104 else 'refuted'} "
          f"({tot['LC_1']}; AT_90 {tot['AT_90']}, LC_5 {tot['LC_5']})")
    print(f"K6 LCP_1 >= 5 of 8 real shape, high-amplitude points: {'held' if hr['LCP_1'] >= 5 else 'refuted'} "
          f"({hr['LCP_1']}; LCP_5 {hr['LCP_5']})")
    n7 = sum(x >= 1.0 for x in kmr[1])
    print(f"K7 LC_1 km/B >= 1.0 in >= 150 of 168: {'held' if n7 >= 150 else 'refuted'} ({n7}; min {min(kmr[1]):.4f})")
    print(f"K8 LC_1 > AT_90 over the {8 * len(hi)} per-point real-shape high-amplitude cells: "
          f"{'held' if pp_hi['LC_1'] > pp_hi['AT_90'] else 'refuted'} (LC_1 {pp_hi['LC_1']}, AT_90 {pp_hi['AT_90']})")


if __name__ == "__main__":
    main()
