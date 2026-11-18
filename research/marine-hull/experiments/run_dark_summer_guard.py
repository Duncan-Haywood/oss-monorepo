"""Milestone 6zzp: does a deployable, asymmetric guard on the learned local summer (distrust a summer the one
learning year says is darker than the climatology, keep one it says is brighter) repair the high-amplitude collapse
of the bad learning years without costing the good ones, over all 30 points and all five single-year lags? And does
6zzo's early-bright tilt hold as a rule out of sample?

Why: 6zzo's "Next". 6zzo found lag 3's high-amplitude collapse (LC_3 1 of 168) is carried by the (point, half,
shape) cells where it learned a darker summer than the scored years saw: brightening the level only there wins 49,
darkening it only where it is too bright wins 1; and 6zzn found erring bright costs little at this edge (a brighter
summer makes the boat bolder). That split used OC, the in-sample correction a deployed boat cannot know. The only
reference a boat with one learned year does have is the climatology itself (c_m = 1, the uncorrected AT_90). So the
deployable version is: in the local-summer months, never let a learned ratio go below 1. 6zzo also found one shape
lever with a clear direction: lag 2 with its summer tilted early-bright by 0.03 won 166 of 168, scored on the cells
it was chosen on; here the same forced tilt is applied to every lag on all 30 points.

Design (fixed here, before any configuration below was run):
  Data, split, payload, packs, shapes, clamp, interpolation, AT_90 rule, baseline B and "dominates B" exactly as
  6zzj and 6zzo (NASA POWER daily ALLSKY_SFC_SW_DWN 2005 to 2014 at the 30 points, climatology 2015 to 2024, halves
  E 2005 to 2009 and L 2010 to 2014, 50 W, packs 2.5 / 5 / 10 / 20 kWh, the real shape plus 6zz's 20 swept shapes).
  Counts: all168 (pooled over 30 points), real8 (real shape pooled over 30), hi168 (pooled over 6zza's nine
  high-amplitude points), pp240 (per point, real shape, 30 x 2 halves x 4 packs). Lag g in 1..5 (one learning
  year; scoring L learns from 2010 - g, scoring E from 2009 + g). Local summer as 6zzl (JJA north of the equator,
  DJF south; at the near-equator points this is a calendar label, not a sunny season, disclosed).
  Rules per lag g, all AT_90 on the climatology scaled by the interpolated monthly ratios c'_m (learned c_m after
  6zzi's clamp [0.85, 1.15]; the guards stay inside the clamp range, TE can leave it and is not
  re-clamped, as in 6zzo):
    LC_g   raw learned ratios (checks: all168 97 / 117 / 132 / 152 / 111, hi168 77 / 153 / 1 / 124 / 50).
    DG_g   dark guard: summer months c'_m = max(c_m, 1); other months unchanged.
    DH_g   half dark guard: summer months with c_m < 1 move halfway to 1: c'_m = (c_m + 1) / 2.
    SZ_g   symmetric control: summer months c'_m = 1 (no summer correction at all).
    DA_g   all-year dark guard: every month c'_m = max(c_m, 1).
    TE_g   6zzo's early-bright tilt: summer tilt T shifted by -0.03, level and curvature held (6zzo's G2_t-0.03
           when g = 2; check: hi168 166).
  AT_90 (no correction) all168 139, hi168 25, real8 8, pp240 126 (6zzj).
Predictions (priors in brackets; "mean" = mean over the five lags):
  G1  DG lifts lag 3 at the high-amplitude points: DG_3 hi168 >= 30 (from 1). [55%]
  G2  DG costs the best year little there: DG_2 hi168 >= 143 (LC_2 153). [55%]
  G3  DG's mean hi168 is at least LC's 81.0. [60%]
  G4  DG's mean all168 is at least LC's 121.8. [60%]
  G5  DG's mean all168 is at least AT_90's 139. [30%]
  G6  The asymmetry matters: DG's mean hi168 > SZ's mean hi168. [55%]
  G7  DH sits between: for lag 3, LC_3 <= DH_3 <= DG_3 on hi168. [65%]
  G8  Guarding the dark months all year costs more than it buys: DA's mean all168 < DG's mean all168. [55%]
  G9  The early-bright tilt generalises at the high-amplitude points: TE_g hi168 > LC_g for at least 4 of 5 lags. [40%]
  G10 It does not cost the other points: TE's mean all168 >= LC's 121.8. [45%]
  G11 DG's worst lag on hi168 is at least 30 (LC's worst: 1). [35%]
Descriptive: every rule x lag on all five counts; per rule mean [min, max] over lags; failure modes (km only, dark
  only, both) of the hi168 cells for LC, DG and TE per lag; the share of learned summer months with c_m < 1 per lag
  (read after scoring, as a description of how often the guard acts).

Run (from research/marine-hull): PYTHONPATH=src python3 experiments/run_dark_summer_guard.py > experiments/results_dark_summer_guard.txt
(stdlib, deterministic; uses up to 4 processes)"""
import os
import statistics as st
import sys
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import run_blend_transfer as bt  # noqa: E402
import run_fresh_years as fy  # noqa: E402
import run_lag3_diagnosis as dg  # noqa: E402
import run_learn_years as ly  # noqa: E402
import run_learned_season as ls  # noqa: E402
import run_pack_hotel_tau as pt  # noqa: E402
import run_season_week as sw  # noqa: E402
import run_self_bias as sb  # noqa: E402
import run_subset_years as su  # noqa: E402
import run_summer_shift as ss  # noqa: E402
import run_summer_tilt as tl  # noqa: E402
import run_year_pack as yp  # noqa: E402

PACKS, HOTEL, BASE, PS = fy.PACKS, fy.HOTEL, fy.BASE, fy.PS
HALVES, YEARS = fy.HALVES, fy.YEARS
REAL, SHAPES, N = ls.REAL, ls.SHAPES, ls.N
LAGS = (1, 2, 3, 4, 5)
TAGS = ("LC", "DG", "DH", "SZ", "DA", "TE")
TILT = -0.03
RULES = ("AT_90",) + tuple(f"{t}_{g}" for t in TAGS for g in LAGS)
CHECK_ALL = {f"LC_{g}": v for g, v in zip(LAGS, (97, 117, 132, 152, 111))}
CHECK_HI = {f"LC_{g}": v for g, v in zip(LAGS, (77, 153, 1, 124, 50))}
CHECK_HI["TE_2"] = 166
CHECK_AT = {"all168": 139, "hi168": 25, "real8": 8, "pp240": 126}


def guard(c, months, how):
    """Apply a guard to the calendar months in `months`: 'max' -> max(c, 1), 'half' -> halfway to 1 if below,
    'one' -> 1."""
    out = []
    for i, x in enumerate(c):
        if i + 1 in months:
            if how == "max":
                x = max(x, 1.0)
            elif how == "half":
                x = (x + 1.0) / 2.0 if x < 1.0 else x
            elif how == "one":
                x = 1.0
        out.append(x)
    return tuple(out)


def corrections(p, hn, shape):
    """{rule: 12 monthly ratios} for every corrected rule, scoring half hn."""
    summer = dg.season_months(p, "summer")
    ms = tl.summer_order(p)
    out = {}
    for g in LAGS:
        c = ly.learned(p, su.years_of(hn, (g,)), shape)[0]
        L, T, K = tl.components(c, ms)
        out[f"LC_{g}"] = c
        out[f"DG_{g}"] = guard(c, summer, "max")
        out[f"DH_{g}"] = guard(c, summer, "half")
        out[f"SZ_{g}"] = guard(c, summer, "one")
        out[f"DA_{g}"] = guard(c, range(1, 13), "max")
        out[f"TE_{g}"] = tl.rebuild(c, ms, L, T + TILT, K)
    return out


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
    runs = {"AT_90": (T, hc)}
    for g, cm in corrections(p, fy.half_of(yr), shape).items():
        hm = [ls.interp(cm, d) * x for d, x in enumerate(hc)]
        runs[g] = (pt.target(hm, cap, HOTEL), hm)
    for g, (TT, cc) in runs.items():
        taus = [sb.tau_of(1.0 / x) for x in sb.ratios(h, cc, N)]
        km, dark, days = sb.run(h, TT, cc, a, taus, ones, cap, HOTEL)
        out[g] = (km, dark - idle_dark, days)
    return key, out


def evaluate(points=bt.PTS, shapes=SHAPES, procs=4):
    fy.prepare()
    keys = [(c, p, yr) + sh for p in points for yr in YEARS for c in PACKS for sh in shapes]
    with Pool(procs) as pool:
        res = pool.map(score, keys, chunksize=8)
    return dict(res)


def dark_share(points):
    """{lag: share of learned local-summer months with c_m < 1}, over points x halves x 21 shapes."""
    out = {}
    for g in LAGS:
        n = k = 0
        for p in points:
            summer = dg.season_months(p, "summer")
            for hn in HALVES:
                for sh in SHAPES:
                    c = ly.learned(p, su.years_of(hn, (g,)), sh)[0]
                    for m in summer:
                        n += 1
                        k += c[m - 1] < 1.0
        out[g] = k / n
    return out


def main():
    ss.RULES = RULES  # ss's counting helpers read the rule list from their module
    pts, hi = bt.PTS, ls.high_amp_points()
    cells = evaluate(pts)
    tab = {"all168": ss.pooled(cells, pts, SHAPES), "real8": ss.pooled(cells, pts, (REAL,)),
           "hi168": ss.pooled(cells, hi, SHAPES), "pp240": ss.per_point(cells, pts)}
    print("Milestone 6zzp: an asymmetric guard on the learned local summer, and 6zzo's early-bright tilt, "
          "scored on all 30 points and the five single-year lags, 2005 to 2014 (50 W)")
    print("lag g: scoring L learns from 2010 - g, scoring E from 2009 + g; local summer JJA north, DJF south")
    print(f"high-amplitude points: {', '.join(hi)} ({len(hi)})")
    ok = (all(tab["all168"][g] == v for g, v in CHECK_ALL.items())
          and all(tab["hi168"][g] == v for g, v in CHECK_HI.items())
          and all(tab[k]["AT_90"] == v for k, v in CHECK_AT.items()))
    print("\nChecks (6zzj, 6zzo): all168 " + ", ".join(f"{g} {tab['all168'][g]} ({v})" for g, v in CHECK_ALL.items())
          + "; hi168 " + ", ".join(f"{g} {tab['hi168'][g]} ({v})" for g, v in CHECK_HI.items())
          + "; AT_90 " + ", ".join(f"{k} {tab[k]['AT_90']} ({v})" for k, v in CHECK_AT.items())
          + ("  ok" if ok else "  MISMATCH"))

    cols = ("all168", "real8", "hi168", "pp240")
    print("\nPer rule and lag: dominance counts")
    print("  rule   | " + " | ".join(f"{c:>7s}" for c in cols))
    for g in RULES:
        print(f"  {g:6s} | " + " | ".join(f"{tab[c][g]:7d}" for c in cols))

    print("\nPer rule over the five lags: mean [min, max]")
    summ = {}
    for t in TAGS:
        row = []
        for c in cols:
            xs = [tab[c][f"{t}_{g}"] for g in LAGS]
            summ[(t, c)] = (st.mean(xs), min(xs), max(xs))
            row.append(f"{st.mean(xs):6.1f} [{min(xs):3d},{max(xs):3d}]")
        print(f"  {t:3s} | " + " | ".join(row))

    print("\nFailing hi168 cells by mode (km only / dark only / both)")
    for t in ("LC", "DG", "TE"):
        print(f"  {t}: " + "; ".join(
            "lag {} {}/{}/{}".format(g, *ss.failure_modes(cells, hi, f"{t}_{g}")) for g in LAGS))

    print("\nShare of learned local-summer months with c_m < 1 (all 30 points / high-amplitude points)")
    da, dh = dark_share(pts), dark_share(hi)
    print("  " + ", ".join(f"lag {g} {da[g]:.2f} / {dh[g]:.2f}" for g in LAGS))

    m = lambda t, c: summ[(t, c)][0]  # noqa: E731
    v = lambda b: "held" if b else "refuted"  # noqa: E731
    hi168 = tab["hi168"]
    print("\nPredictions")
    print(f"G1 DG_3 hi168 >= 30: {v(hi168['DG_3'] >= 30)} ({hi168['DG_3']})")
    print(f"G2 DG_2 hi168 >= 143: {v(hi168['DG_2'] >= 143)} ({hi168['DG_2']})")
    print(f"G3 DG mean hi168 >= 81.0: {v(m('DG', 'hi168') >= 81.0)} ({m('DG', 'hi168'):.1f})")
    print(f"G4 DG mean all168 >= 121.8: {v(m('DG', 'all168') >= 121.8)} ({m('DG', 'all168'):.1f})")
    print(f"G5 DG mean all168 >= 139: {v(m('DG', 'all168') >= 139)} ({m('DG', 'all168'):.1f})")
    print(f"G6 DG mean hi168 > SZ mean hi168: {v(m('DG', 'hi168') > m('SZ', 'hi168'))} "
          f"({m('DG', 'hi168'):.1f} vs {m('SZ', 'hi168'):.1f})")
    print(f"G7 LC_3 <= DH_3 <= DG_3 on hi168: {v(hi168['LC_3'] <= hi168['DH_3'] <= hi168['DG_3'])} "
          f"({hi168['LC_3']}, {hi168['DH_3']}, {hi168['DG_3']})")
    print(f"G8 DA mean all168 < DG mean all168: {v(m('DA', 'all168') < m('DG', 'all168'))} "
          f"({m('DA', 'all168'):.1f} vs {m('DG', 'all168'):.1f})")
    n9 = sum(hi168[f"TE_{g}"] > hi168[f"LC_{g}"] for g in LAGS)
    print(f"G9 TE_g > LC_g on hi168 for >= 4 of 5 lags: {v(n9 >= 4)} ({n9} of 5)")
    print(f"G10 TE mean all168 >= 121.8: {v(m('TE', 'all168') >= 121.8)} ({m('TE', 'all168'):.1f})")
    print(f"G11 DG worst lag hi168 >= 30: {v(summ[('DG', 'hi168')][1] >= 30)} ({summ[('DG', 'hi168')][1]})")


if __name__ == "__main__":
    main()
