"""Milestone 6zzo: inside lag 3's learned local summer, which part of the month-to-month pattern carries the
high-amplitude collapse: the level, the tilt (early against late summer) or the curvature (mid-summer against its
edges)? And does lag 3's pattern, put into the best year (lag 2), break it?

Why: 6zzn's "Next". 6zzl found that replacing lag 3's three local-summer months with the in-sample correction OC's
recovers 0.87 of the gap (LC_3 1 -> 90 of 168 high-amplitude cells); 6zzn's forced shifts showed the summer's level
cannot be the cause (closing the gap by level takes about 10%, some 25 times the 0.4% difference between lags 2
and 3). What is left of a summer repair is its shape, which with three months has two degrees of freedom.
Before any configuration here was scored, the learned ratios alone were read on the real shape (descriptive, not
a result): against OC, lag 3's summer tilt error averages +0.009 over the nine points and two halves (late summer
learned brighter), lag 2's -0.008, the other lags -0.001 to +0.003; mean |tilt error| 0.050 for lag 3 and 0.034 for
lag 2; mean |curvature error| 0.064 for lag 3 and 0.091 for lag 2. So by size lag 3's summer shape is not worse
than lag 2's, and only the tilt's sign stands out.

Design (fixed here, before any configuration below was run):
  Data, split, payload, packs, shapes, clamp, interpolation, AT_90 rule, baseline B and "dominates B" exactly as
  6zzl and 6zzn (NASA POWER daily ALLSKY_SFC_SW_DWN 2005 to 2014 at the nine high-amplitude points of 6zza,
  climatology 2015 to 2024, halves E 2005 to 2009 and L 2010 to 2014, 50 W, packs 2.5 / 5 / 10 / 20 kWh, the real
  shape plus 6zz's 20 swept shapes: 168 cells pooled over the nine points; 8 real-shape pooled cells; 72 per-point
  real-shape cells). Local summer as 6zzl (JJA north of the equator, DJF south), months taken in seasonal order
  (m1, m2, m3) = (Jun, Jul, Aug) or (Dec, Jan, Feb).
  Components of a summer (c1, c2, c3): level L = (c1 + c2 + c3) / 3, tilt T = (c3 - c1) / 2, curvature
  K = c2 - (c1 + c3) / 2; inversely c1 = L - T - K/3, c2 = L + 2K/3, c3 = L + T - K/3. Every rule below rebuilds
  the three summer months from (L, T, K) with some components taken from another correction learned on the same
  point, half and shape; the other nine months are unchanged; after 6zzi's clamp, not re-clamped.
  Rules (all AT_90 on the climatology hc scaled by the interpolated c_m):
    AT_90            no correction (6zzi: hi168 25).
    LC_2, LC_3, OC   checks: 153 / 1 / 103 (6zzi, 6zzl).
    R3_S             lag 3, summer (L, T, K) all from OC = 6zzl's R3_summer (check: 90).
    R3_L, R3_T, R3_K lag 3 with one summer component from OC.
    R3_TK            lag 3 with OC's tilt and curvature, its own level (shape repair).
    G2_T3, G2_K3     lag 2 with lag 3's summer tilt, or curvature (the transplant).
    G2_TK3           lag 2 with lag 3's summer tilt and curvature, its own level.
    G3_TK2           lag 3 with lag 2's summer tilt and curvature, its own level (the reverse transplant).
    G2_t{d}          lag 2 with its summer tilt shifted by d (absolute, ratio units), L and K held:
                     d = -0.03, -0.01, +0.01, +0.03 (positive: late summer brighter, early darker). For scale, the
                     mean tilt gap between lags 3 and 2 is +0.017, their mean |tilt error| 0.03 to 0.05.
  "Recovery" of a lag-3 repair = (rule - LC_3) / (R3_S - LC_3), on hi168.
Predictions (priors in brackets):
  T1  The level repair recovers little: R3_L hi168 <= 10. [70%]
  T2  The shape carries the summer repair: R3_TK hi168 >= 75 (about 0.85 of R3_S's 90). [55%]
  T3  Tilt recovers at least half: R3_T >= 46. [40%]
  T4  Curvature recovers at least half: R3_K >= 46. [35%]
  T5  Lag 3's summer shape breaks lag 2: G2_TK3 <= 102 (lag 2 loses a third of its 153). [50%]
  T6  Tilt alone breaks it: G2_T3 <= 102. [35%]
  T7  Lag 2's summer shape rescues lag 3: G3_TK2 >= 52 (half of OC's 103). [45%]
  T8  A forced late-bright tilt hurts lag 2 more than an early-bright one: G2_t+0.03 hi168 < G2_t-0.03 hi168. [55%]
  T9  As for LC_3 (6zzl), the cells lag 2 loses under lag 3's shape fail on km: among G2_TK3's failing hi168 cells,
      km-only failures outnumber those involving dark hours. [60%]
Descriptive: every rule's hi168, hireal8, pp72 and failure modes; real-shape pooled km/B and ex/B per half and pack
  for LC_2, LC_3, R3_S, R3_TK, G2_TK3 and the G2_t series; per lag the mean (L, T, K) error against OC.

Run (from research/marine-hull): PYTHONPATH=src python3 experiments/run_summer_tilt.py > experiments/results_summer_tilt.txt
(stdlib, deterministic; uses up to 4 processes)"""
import os
import statistics as st
import sys
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import run_fresh_years as fy  # noqa: E402
import run_lag3_diagnosis as dg  # noqa: E402
import run_learn_years as ly  # noqa: E402
import run_learned_season as ls  # noqa: E402
import run_pack_hotel_tau as pt  # noqa: E402
import run_season_week as sw  # noqa: E402
import run_self_bias as sb  # noqa: E402
import run_subset_years as su  # noqa: E402
import run_summer_shift as ss  # noqa: E402
import run_year_pack as yp  # noqa: E402

PACKS, HOTEL, BASE, PS = fy.PACKS, fy.HOTEL, fy.BASE, fy.PS
HALVES, YEARS = fy.HALVES, fy.YEARS
REAL, SHAPES, N = ls.REAL, ls.SHAPES, ls.N
TILTS = (-0.03, -0.01, 0.01, 0.03)
CHECK = {"AT_90": 25, "LC_2": 153, "LC_3": 1, "OC": 103, "R3_S": 90}


def tname(d):
    return f"G2_t{d:+g}"


RULES = (("AT_90", "LC_2", "LC_3", "OC", "R3_S", "R3_L", "R3_T", "R3_K", "R3_TK", "G2_T3", "G2_K3", "G2_TK3",
          "G3_TK2") + tuple(tname(d) for d in TILTS))


def summer_order(p):
    """The three local-summer calendar months (1..12) in seasonal order."""
    ms = dg.season_months(p, "summer")
    return (12, 1, 2) if 12 in ms else tuple(sorted(ms))


def components(c, ms):
    a, b, d = (c[m - 1] for m in ms)
    return (a + b + d) / 3.0, (d - a) / 2.0, b - (a + d) / 2.0


def rebuild(c, ms, L, T, K):
    """c with its summer months ms rebuilt from level L, tilt T and curvature K."""
    vals = {ms[0]: L - T - K / 3.0, ms[1]: L + 2.0 * K / 3.0, ms[2]: L + T - K / 3.0}
    return tuple(vals.get(i + 1, x) for i, x in enumerate(c))


def mix(base, donor, ms, take):
    """base's summer with the components named in `take` ('L', 'T', 'K') from donor."""
    b, d = components(base, ms), components(donor, ms)
    return rebuild(base, ms, *(d[i] if k in take else b[i] for i, k in enumerate("LTK")))


def corrections(p, hn, shape):
    """{rule: 12 monthly ratios} for every corrected rule, scoring half hn."""
    c2, c3 = (ly.learned(p, su.years_of(hn, (g,)), shape)[0] for g in (2, 3))
    oc = ly.learned(p, HALVES[hn], shape)[0]
    ms = summer_order(p)
    out = {"LC_2": c2, "LC_3": c3, "OC": oc, "R3_S": mix(c3, oc, ms, "LTK"), "R3_L": mix(c3, oc, ms, "L"),
           "R3_T": mix(c3, oc, ms, "T"), "R3_K": mix(c3, oc, ms, "K"), "R3_TK": mix(c3, oc, ms, "TK"),
           "G2_T3": mix(c2, c3, ms, "T"), "G2_K3": mix(c2, c3, ms, "K"), "G2_TK3": mix(c2, c3, ms, "TK"),
           "G3_TK2": mix(c3, c2, ms, "TK")}
    L, T, K = components(c2, ms)
    for d in TILTS:
        out[tname(d)] = rebuild(c2, ms, L, T + d, K)
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


def component_errors(points):
    """{lag: (mean dL, mean dT, mean dK, mean |dL|, mean |dT|, mean |dK|)} against OC on the real shape."""
    out = {}
    for g in (1, 2, 3, 4, 5):
        es = []
        for p in points:
            ms = summer_order(p)
            for hn in HALVES:
                o = components(ly.learned(p, HALVES[hn], REAL)[0], ms)
                c = components(ly.learned(p, su.years_of(hn, (g,)), REAL)[0], ms)
                es.append(tuple(a - b for a, b in zip(c, o)))
        out[g] = tuple(st.mean(e[i] for e in es) for i in range(3)) + tuple(
            st.mean(abs(e[i]) for e in es) for i in range(3))
    return out


def main():
    ss.RULES = RULES  # ss's counting helpers read the rule list from their module
    hi = ls.high_amp_points()
    cells = evaluate(hi)
    t168 = ss.pooled(cells, hi, SHAPES)
    t8 = ss.pooled(cells, hi, (REAL,))
    pp = ss.per_point(cells, hi)
    print("Milestone 6zzo: level, tilt and curvature of the learned local summer at the high-amplitude points, "
          "2005 to 2014 (50 W)")
    print("summer (c1, c2, c3) in seasonal order -> L = mean, T = (c3 - c1) / 2, K = c2 - (c1 + c3) / 2; "
          "lag g: scoring L learns from 2010 - g, scoring E from 2009 + g")
    print(f"high-amplitude points: {', '.join(hi)} ({len(hi)})")
    ok = all(t168[g] == v for g, v in CHECK.items())
    print("\nChecks (6zzi, 6zzl): " + ", ".join(f"{g} {t168[g]} ({v})" for g, v in CHECK.items())
          + ("  ok" if ok else "  MISMATCH"))

    print("\nSummer component errors against OC, real shape, mean over 9 points x 2 halves")
    print("  lag   mean dL   mean dT   mean dK   |dL|    |dT|    |dK|")
    for g, e in component_errors(hi).items():
        print(f"  {g}   {e[0]:+.4f}  {e[1]:+.4f}  {e[2]:+.4f}   {e[3]:.4f}  {e[4]:.4f}  {e[5]:.4f}")

    print("\nDominance counts: hi168 (pooled over the 9 points, 21 shapes x 2 halves x 4 packs), "
          "hireal8 (real shape pooled), pp72 (real shape, per point); failing hi168 cells by mode")
    print(f"  {'rule':10s}  hi168  hireal8  pp72   km-only  dark-only  both")
    modes = {}
    for g in RULES:
        modes[g] = ss.failure_modes(cells, hi, g)
        k, dk, b = modes[g]
        print(f"  {g:10s}  {t168[g]:5d}  {t8[g]:7d}  {pp[g]:4d}   {k:7d}  {dk:9d}  {b:4d}")

    show = ("AT_90", "LC_2", "LC_3", "R3_S", "R3_TK", "G2_TK3") + tuple(tname(d) for d in TILTS)
    ser = ss.real_series(cells, hi, show)
    print("\nReal shape pooled over the 9 points: km/B (ex/B) per half and pack")
    print("  half C kWh | " + " ".join(f"{g:>13s}" for g in show))
    for (hn, c), row in ser.items():
        print(f"  {hn:4s} {c / 1000:5.1f} | " + " ".join(f"{row[g][0]:7.4f} ({row[g][1]:4.2f})" for g in show))

    gap = t168["R3_S"] - t168["LC_3"]
    print("\nRecovery of the summer repair (rule - LC_3) / (R3_S - LC_3): " + ", ".join(
        f"{g} {(t168[g] - t168['LC_3']) / gap:.2f}" for g in ("R3_L", "R3_T", "R3_K", "R3_TK", "G3_TK2")))
    print("Lag-2 tilt series hi168: " + ", ".join(
        f"{d:+g} {t168[tname(d)]}" for d in TILTS[:2]) + f", 0 {t168['LC_2']}, " + ", ".join(
        f"{d:+g} {t168[tname(d)]}" for d in TILTS[2:]))

    v = lambda b: "held" if b else "refuted"  # noqa: E731
    k, dk, b = modes["G2_TK3"]
    print("\nPredictions")
    print(f"T1 R3_L <= 10: {v(t168['R3_L'] <= 10)} ({t168['R3_L']})")
    print(f"T2 R3_TK >= 75: {v(t168['R3_TK'] >= 75)} ({t168['R3_TK']})")
    print(f"T3 R3_T >= 46: {v(t168['R3_T'] >= 46)} ({t168['R3_T']})")
    print(f"T4 R3_K >= 46: {v(t168['R3_K'] >= 46)} ({t168['R3_K']})")
    print(f"T5 G2_TK3 <= 102: {v(t168['G2_TK3'] <= 102)} ({t168['G2_TK3']})")
    print(f"T6 G2_T3 <= 102: {v(t168['G2_T3'] <= 102)} ({t168['G2_T3']})")
    print(f"T7 G3_TK2 >= 52: {v(t168['G3_TK2'] >= 52)} ({t168['G3_TK2']})")
    a, bb = t168[tname(0.03)], t168[tname(-0.03)]
    print(f"T8 G2_t+0.03 < G2_t-0.03: {v(a < bb)} ({a} vs {bb})")
    print(f"T9 G2_TK3 failures mostly km only: {v(k > dk + b)} (km only {k} vs dark only {dk} + both {b})")


if __name__ == "__main__":
    main()
