"""Milestone 6zzl: why does learning the seasonal correction from lag 3 (2007 for L, 2012 for E) wipe out the
high-latitude points, and which months, level or shape carry the damage?

Why: 6zzi to 6zzk's "Next". At the nine high-amplitude points the raw month ratios learned from lag 3 dominate the
trailing-mean baseline B in 1 of 168 pooled cells (6zzi; lag 2 wins 153, no correction AT_90 25), every shrinkage
rule loses there too (6zzj: 1 to 9), and a second year dilutes but does not cancel it (6zzk). Over all 30 points
lag 3 is a middling year (132 of 168). Before a designer is told "check against the lag-3 kind of year", the paper
has to say what that kind of year is: a few wrong months, a wrong annual level, or a wrong seasonal shape.

Design (fixed here, before any configuration below was run):
  Data, split, payload, packs, shapes, clamp, interpolation, AT_90 rule and "dominates B" exactly as 6zzi
  (NASA POWER daily ALLSKY_SFC_SW_DWN 2005 to 2014 at the nine high-amplitude points of 6zza, climatology 2015 to
  2024, halves E 2005 to 2009 and L 2010 to 2014, 50 W, packs 2.5 / 5 / 10 / 20 kWh, the real shape plus 6zz's
  20 swept shapes: 168 cells pooled over the nine points; 72 per-point real-shape cells).
  Rules, all AT_90 on the climatology hc scaled by an interpolated monthly ratio c_m:
    LC_g   g = 1..5: c_m learned on the single year at lag g (6zzi's LC_g; a check: hi168 77 / 153 / 1 / 124 / 50).
    OC     c*_m learned on the scored half itself (its five years): an in-sample ceiling for a five-year-mean
           correction, not a deployable rule.
    R3_m   m = 1..12: lag 3's c_m with calendar month m replaced by c*_m.
    R3_s   s = winter, spring, summer, autumn, local (DJF / MAM / JJA / SON north of the equator, shifted six months
           south of it): lag 3's c_m with the season's three months replaced by c*_m.
    LV3    lag 3's shape at the oracle's level: c3_m x L(c*) / L(c3), with L(c) = sum_m w_m c_m, w_m the scored
           half's share of shape-scaled climatology energy in month m (repairs the annual level only).
    SH3    the oracle's shape at lag 3's level: c*_m x L(c3) / L(c*) (repairs the shape only).
  Gap = OC - LC_3 on the high-amplitude 168 cells; a variant's recovery = (variant - LC_3) / gap.
  Error descriptive: e_m(g) = c_m(lag g) - c*_m per point, half and month on the real shape; per lag the
  energy-weighted mean |e_m| and mean e_m over the nine points and both halves; per local season for lag 3.
  Failure mode: on the high-amplitude cells LC_3 does not dominate, count those that fail on km (km < B),
  on dark hours (excess > B's) or both.
Predictions (priors in brackets):
  D1  OC dominates in at least 153 of the 168 high-amplitude cells (LC_2's, the best single year). [65%]
  D2  Lag 3's energy-weighted mean |e_m| on the real shape is the largest of the five lags. [55%]
  D3  Most of LC_3's failing high-amplitude cells fail on dark hours (alone or with km), not on km alone. [60%]
  D4  Repairing one local season (best R3_s) recovers at least half the gap. [50%]
  D5  That best season is local winter. [40%]
  D6  No single calendar month's repair (best R3_m) recovers half the gap. [55%]
  D7  LV3 (level repaired) recovers more cells than SH3 (shape repaired): the failure is mostly level. [45%]
Descriptive: every rule's hi168, hireal8 and per-point real (72) counts; pooled km/B and ex/B of LC_3, LV3, SH3,
  OC on the real shape per half and pack; the per-point lag-3 c_m and c*_m on the real shape.

Run (from research/marine-hull): PYTHONPATH=src python3 experiments/run_lag3_diagnosis.py > experiments/results_lag3_diagnosis.txt
(stdlib, deterministic; uses up to 4 processes)"""
import os
import statistics as st
import sys
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import run_fresh_years as fy  # noqa: E402
import run_learn_years as ly  # noqa: E402
import run_learned_season as ls  # noqa: E402
import run_pack_hotel_tau as pt  # noqa: E402
import run_reserve_curve as rc  # noqa: E402
import run_season_week as sw  # noqa: E402
import run_self_bias as sb  # noqa: E402
import run_subset_years as su  # noqa: E402
import run_year_pack as yp  # noqa: E402

PACKS, HOTEL, BASE, PS = fy.PACKS, fy.HOTEL, fy.BASE, fy.PS
HALVES, YEARS = fy.HALVES, fy.YEARS
REAL, SHAPES, N = ls.REAL, ls.SHAPES, ls.N
LAGS = (1, 2, 3, 4, 5)
SEASONS = ("winter", "spring", "summer", "autumn")
NORTH = {"winter": (12, 1, 2), "spring": (3, 4, 5), "summer": (6, 7, 8), "autumn": (9, 10, 11)}
RULES = (("AT_90",) + tuple(f"LC_{g}" for g in LAGS) + ("OC",) + tuple(f"R3_{m:02d}" for m in range(1, 13))
         + tuple(f"R3_{s}" for s in SEASONS) + ("LV3", "SH3"))
CHECK = {1: 77, 2: 153, 3: 1, 4: 124, 5: 50}  # 6zzi hi168 for the single lags


def season_months(p, s):
    """Calendar months (1..12) of local season s at point p."""
    ms = NORTH[s]
    if yp.lat_of(p) < 0:
        ms = tuple((m + 5) % 12 + 1 for m in ms)
    return ms


def weights(p, hn, shape):
    """w_m: the scored half's share of shape-scaled climatology energy in month m."""
    cs = [0.0] * 12
    for yr in HALVES[hn]:
        hc = ls.scaled(p, yr, shape)[1]
        for d, y in zip(rc.dates(yr), hc):
            cs[d.month - 1] += y
    tot = sum(cs)
    return [c / tot for c in cs]


def level(c, w):
    return sum(a * b for a, b in zip(c, w))


def corrections(p, hn, shape):
    """{rule: 12 monthly ratios} for every corrected rule, scoring half hn."""
    lag = {g: ly.learned(p, su.years_of(hn, (g,)), shape)[0] for g in LAGS}
    cs = ly.learned(p, HALVES[hn], shape)[0]
    c3 = lag[3]
    out = {f"LC_{g}": lag[g] for g in LAGS}
    out["OC"] = cs
    for m in range(1, 13):
        out[f"R3_{m:02d}"] = tuple(cs[i] if i == m - 1 else c3[i] for i in range(12))
    for s in SEASONS:
        ms = season_months(p, s)
        out[f"R3_{s}"] = tuple(cs[i] if i + 1 in ms else c3[i] for i in range(12))
    w = weights(p, hn, shape)
    l3, ls_ = level(c3, w), level(cs, w)
    out["LV3"] = tuple(x * ls_ / l3 for x in c3)
    out["SH3"] = tuple(x * l3 / ls_ for x in cs)
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


def evaluate(points, shapes=SHAPES, procs=4):
    fy.prepare()
    keys = [(c, p, yr) + sh for p in points for yr in YEARS for c in PACKS for sh in shapes]
    with Pool(procs) as pool:
        res = pool.map(score, keys, chunksize=8)
    return dict(res)


def pooled(cells, points, shapes):
    n = dict.fromkeys(RULES, 0)
    for sh in shapes:
        for hn, yrs in HALVES.items():
            for c in PACKS:
                t = sb.total(cells, [(c, p, yr) + sh for p in points for yr in yrs])
                for g in RULES:
                    n[g] += sb.dominates(t, g)
    return n


def per_point(cells, points):
    n = dict.fromkeys(RULES, 0)
    for p in points:
        for hn, yrs in HALVES.items():
            for c in PACKS:
                t = sb.total(cells, [(c, p, yr) + REAL for yr in yrs])
                for g in RULES:
                    n[g] += sb.dominates(t, g)
    return n


def failure_modes(cells, points, rule):
    """Among pooled high-amplitude cells the rule does not dominate: (km only, dark only, both)."""
    km_only = dark_only = both = 0
    for sh in SHAPES:
        for hn, yrs in HALVES.items():
            for c in PACKS:
                t = sb.total(cells, [(c, p, yr) + sh for p in points for yr in yrs])
                fk, fd = t[rule][0] < t[BASE][0], t[rule][1] > t[BASE][1]
                km_only += fk and not fd
                dark_only += fd and not fk
                both += fk and fd
    return km_only, dark_only, both


def errors(points):
    """Real shape: per lag, energy-weighted mean |e_m| and mean e_m over points and halves; per point/half rows."""
    fy.prepare()
    absw, sgnw, rows = {g: [] for g in LAGS}, {g: [] for g in LAGS}, []
    seas = {s: [] for s in SEASONS}
    for p in points:
        for hn in HALVES:
            cs = ly.learned(p, HALVES[hn], REAL)[0]
            w = weights(p, hn, REAL)
            for g in LAGS:
                cg = ly.learned(p, su.years_of(hn, (g,)), REAL)[0]
                e = [x - y for x, y in zip(cg, cs)]
                absw[g].append(sum(wi * abs(x) for wi, x in zip(w, e)))
                sgnw[g].append(sum(wi * x for wi, x in zip(w, e)))
                if g == 3:
                    rows.append((p, hn, cg, cs, w))
                    for s in SEASONS:
                        ms = season_months(p, s)
                        seas[s].append(sum(w[m - 1] * e[m - 1] for m in ms) / sum(w[m - 1] for m in ms))
    return ({g: st.fmean(v) for g, v in absw.items()}, {g: st.fmean(v) for g, v in sgnw.items()},
            {s: st.fmean(v) for s, v in seas.items()}, rows)


def main():
    hi = ls.high_amp_points()
    absw, sgnw, seas, rows = errors(hi)
    cells = evaluate(hi)
    t168 = pooled(cells, hi, SHAPES)
    t8 = pooled(cells, hi, (REAL,))
    pp = per_point(cells, hi)
    print("Milestone 6zzl: diagnosing the lag-3 learning year at the high-amplitude points, 2005 to 2014 (50 W)")
    print("lag g: scoring L learns from 2010 - g, scoring E from 2009 + g; lag 3 = 2007 for L, 2012 for E")
    print(f"high-amplitude points: {', '.join(hi)} ({len(hi)})")
    print("\nCheck against 6zzi (hi168 of the single lags): " + ", ".join(
        f"LC_{g} {t168[f'LC_{g}']} (6zzi {CHECK[g]})" for g in LAGS)
        + ("  ok" if all(t168[f'LC_{g}'] == CHECK[g] for g in LAGS) else "  MISMATCH"))

    print("\nReal-shape error of the learned ratio against the scored half's own (e_m = c_m(lag) - c*_m), "
          "energy-weighted, mean over 9 points x 2 halves")
    print("  lag  mean|e|   mean e")
    for g in LAGS:
        print(f"  {g:3d}  {absw[g]:7.4f}  {sgnw[g]:+7.4f}")
    print("  lag 3 by local season, energy-weighted mean e: " + ", ".join(f"{s} {seas[s]:+.4f}" for s in SEASONS))
    print("\nLag 3 and oracle monthly ratios on the real shape (Jan..Dec), with energy weights w_m")
    for p, hn, cg, cs, w in rows:
        print(f"  {p:15s} {hn} c3 " + " ".join(f"{x:.3f}" for x in cg))
        print(f"  {'':15s}   c* " + " ".join(f"{x:.3f}" for x in cs))
        print(f"  {'':15s}   w  " + " ".join(f"{x:.3f}" for x in w))

    print("\nDominance counts: hi168 (pooled over the 9 points, 21 shapes x 2 halves x 4 packs), "
          "hireal8 (real shape pooled), pp72 (real shape, per point)")
    gap = t168["OC"] - t168["LC_3"]
    print(f"  {'rule':10s}  hi168  hireal8  pp72  recovery of gap ({gap})")
    for g in RULES:
        rec = (t168[g] - t168["LC_3"]) / gap if gap else float("nan")
        print(f"  {g:10s}  {t168[g]:5d}  {t8[g]:7d}  {pp[g]:4d}  {rec:+.2f}")

    print("\nReal shape pooled over the 9 points: km/B and excess-dark/B per half and pack")
    show = ("AT_90", "LC_2", "LC_3", "LV3", "SH3", "OC")
    print("  half C kWh | " + " | ".join(f"{g:>5s} km/B ex/B" for g in show))
    for hn, yrs in HALVES.items():
        for c in PACKS:
            t = sb.total(cells, [(c, p, yr) + REAL for p in hi for yr in yrs])
            bb = t[BASE]
            parts = [f"{t[g][0] / bb[0]:10.4f} {t[g][1] / bb[1] if bb[1] else float('nan'):4.2f}" for g in show]
            print(f"  {hn:4s} {c / 1000:5.1f} | " + " | ".join(parts))

    km_only, dark_only, both = failure_modes(cells, hi, "LC_3")
    nfail = km_only + dark_only + both
    print(f"\nLC_3's failing hi168 cells: {nfail}; km only {km_only}, dark only {dark_only}, both {both}")

    best_s = max(SEASONS, key=lambda s: t168[f"R3_{s}"])
    best_m = max(range(1, 13), key=lambda m: t168[f"R3_{m:02d}"])
    rec = lambda g: (t168[g] - t168["LC_3"]) / gap if gap else 0.0  # noqa: E731
    v = lambda b: "held" if b else "refuted"  # noqa: E731
    print("\nPredictions")
    print(f"D1 OC hi168 >= 153: {v(t168['OC'] >= 153)} ({t168['OC']})")
    print(f"D2 lag 3 has the largest weighted mean |e|: {v(max(LAGS, key=lambda g: absw[g]) == 3)} "
          f"(largest lag {max(LAGS, key=lambda g: absw[g])})")
    print(f"D3 most failures involve dark hours: {v(dark_only + both > km_only)} "
          f"(dark only {dark_only} + both {both} vs km only {km_only})")
    print(f"D4 best season repair recovers >= half the gap: {v(rec(f'R3_{best_s}') >= 0.5)} "
          f"({best_s}, {t168[f'R3_{best_s}']}, recovery {rec(f'R3_{best_s}'):.2f})")
    print(f"D5 best season is local winter: {v(best_s == 'winter')} ({best_s})")
    print(f"D6 no single month recovers half the gap: {v(rec(f'R3_{best_m:02d}') < 0.5)} "
          f"(month {best_m}, {t168[f'R3_{best_m:02d}']}, recovery {rec(f'R3_{best_m:02d}'):.2f})")
    print(f"D7 LV3 > SH3: {v(t168['LV3'] > t168['SH3'])} (LV3 {t168['LV3']}, SH3 {t168['SH3']})")


if __name__ == "__main__":
    main()
