"""Milestone 6zzn: does a brighter learned local summer, on its own, make the seasonal correction fail at the
high-amplitude points? A forced-shift test of 6zzl's summer-sign reading.

Why: 6zzl found that repairing lag 3's local-summer months recovers 0.87 of the gap to the in-sample correction,
that every one of LC_3's 167 failing high-amplitude cells fails on km alone, and (post hoc, five lags) that the two
worst learning years (lags 3 and 5) are the only two that learned a brighter local summer than the scored years saw.
6zzm found the summer-brightness differences between years (about 0.01) are the size of the NASA / ERA5
disagreement, so a second data source cannot settle the mechanism. A forced shift can: take a good learning year,
make its local summer brighter or darker by a known amount, and see whether the count and the km move as the
reading says. Reading under test (M): an over-bright summer expectation makes the AT ratio read an ordinary summer
as a dark spell, so the rule holds back and loses distance.

Design (fixed here, before any configuration below was run):
  Data, split, payload, packs, shapes, clamp, interpolation, AT_90 rule, baseline B and "dominates B" exactly as
  6zzl (NASA POWER daily ALLSKY_SFC_SW_DWN 2005 to 2014 at the nine high-amplitude points of 6zza, climatology 2015
  to 2024, halves E 2005 to 2009 and L 2010 to 2014, 50 W, packs 2.5 / 5 / 10 / 20 kWh, the real shape plus 6zz's 20
  swept shapes: 168 cells pooled over the nine points; 8 real-shape pooled cells; 72 per-point real-shape cells).
  Shift: S(c, months, d) multiplies the learned monthly ratios c_m of the given calendar months by (1 + d), after
  6zzi's clamp and before interpolation (not re-clamped); every other month is unchanged.
  Rules (all AT_90 on the climatology hc scaled by the interpolated, shifted c_m):
    AT_90                        no correction (6zzi: hi168 25).
    G2s{d}  d in DS              lag 2 (best single year, 6zzi hi168 153), local summer shifted by d.
    G3s{d}  d in DS              lag 3 (worst, hi168 1), local summer shifted by d.
    G4s{d}  d in DS4             lag 4 (second best, hi168 124), local summer shifted by d.
    G2w{d}  d in (-3%, +3%)      lag 2, local winter shifted by d (control: same size, the season that carries
                                 least energy at high latitude).
  DS = -3, -2, -1, -0.5, 0, +0.5, +1, +2, +3 %; DS4 = -3, -1, 0, +1, +3 %. Local seasons as 6zzl (JJA summer north of
  the equator, DJF south of it). d = 0 reproduces 6zzi's LC_g (check: 153 / 1 / 124).
  Scale of the shift: lag 3's local-summer energy-weighted mean error is +0.0023 against the scored half's own
  ratios, lag 2's -0.0021 (6zzl's exploratory table), a difference of about 0.4%; 1% is twice that, 3% about seven
  times.
Predictions (priors in brackets):
  F1  On the real shape pooled over the nine points, LC_2's km/B falls as d rises from -3% to +3% (non-increasing
      over DS) in all 8 half x pack series. [70%]
  F2  LC_2's hi168 is non-increasing in d over 0, +0.5, +1, +2, +3 %. [70%]
  F3  A +1% summer shift costs lag 2 at least a third of its cells: G2s+1 hi168 <= 102. [40%]
  F4  At +3% lag 2 falls to no correction's level or below: G2s+3 hi168 <= 25. [45%]
  F5  Darkening lag 3's summer by 1% recovers at least half the 6zzl gap (LC_3 1 to OC 103): G3s-1 hi168 >= 52. [40%]
  F6  Season specificity: G2w+3 keeps hi168 >= 140 while G2s+3 < 103. [50%]
  F7  Darkening fails differently: among G2s-3's failing hi168 cells, those failing on dark hours (alone or with km)
      outnumber those failing on km alone. [55%]
  F8  Lag 4 moves the same way: G4s+3 hi168 < G4s0 hi168. [75%]
Descriptive: every rule's hi168, hireal8, pp72; real-shape pooled km/B and ex/B per half and pack for the lag-2
  summer series; failure modes (km only, dark only, both) for every lag-2 and lag-3 summer rule; the d at which the
  lag-2 and lag-3 summer series cross.

Run (from research/marine-hull): PYTHONPATH=src python3 experiments/run_summer_shift.py > experiments/results_summer_shift.txt
(stdlib, deterministic; uses up to 4 processes)"""
import os
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
import run_year_pack as yp  # noqa: E402

PACKS, HOTEL, BASE, PS = fy.PACKS, fy.HOTEL, fy.BASE, fy.PS
HALVES, YEARS = fy.HALVES, fy.YEARS
REAL, SHAPES, N = ls.REAL, ls.SHAPES, ls.N
DS = (-3.0, -2.0, -1.0, -0.5, 0.0, 0.5, 1.0, 2.0, 3.0)
DS4 = (-3.0, -1.0, 0.0, 1.0, 3.0)
CHECK = {2: 153, 3: 1, 4: 124}  # 6zzi hi168 for the single lags


def tag(d):
    return f"{d:+g}" if d else "0"


def name(g, season, d):
    return f"G{g}{season[0]}{tag(d)}"


SPEC = ([(2, "summer", d) for d in DS] + [(3, "summer", d) for d in DS] + [(4, "summer", d) for d in DS4]
        + [(2, "winter", -3.0), (2, "winter", 3.0)])
RULES = ("AT_90",) + tuple(name(*s) for s in SPEC)


def shift(c, months, d):
    """c_m x (1 + d%) for calendar months in `months` (1..12), others unchanged; no re-clamp."""
    f = 1.0 + d / 100.0
    return tuple(x * f if i + 1 in months else x for i, x in enumerate(c))


def corrections(p, hn, shape):
    """{rule: 12 monthly ratios} for every shifted rule, scoring half hn."""
    lag = {g: ly.learned(p, su.years_of(hn, (g,)), shape)[0] for g in (2, 3, 4)}
    return {name(g, s, d): shift(lag[g], dg.season_months(p, s), d) for g, s, d in SPEC}


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


def real_series(cells, points, rules):
    """{(half, pack): {rule: (km/B, ex/B)}} on the real shape pooled over the points."""
    out = {}
    for hn, yrs in HALVES.items():
        for c in PACKS:
            t = sb.total(cells, [(c, p, yr) + REAL for p in points for yr in yrs])
            bb = t[BASE]
            out[(hn, c)] = {g: (t[g][0] / bb[0], t[g][1] / bb[1] if bb[1] else float("nan")) for g in rules}
    return out


def nonincreasing(xs):
    return all(b <= a for a, b in zip(xs, xs[1:]))


def main():
    hi = ls.high_amp_points()
    cells = evaluate(hi)
    t168 = pooled(cells, hi, SHAPES)
    t8 = pooled(cells, hi, (REAL,))
    pp = per_point(cells, hi)
    print("Milestone 6zzn: forced local-summer shifts of single-year learned corrections at the high-amplitude "
          "points, 2005 to 2014 (50 W)")
    print("lag g: scoring L learns from 2010 - g, scoring E from 2009 + g; G{g}{s}{d}: lag g, local season s "
          "(s summer, w winter) ratios x (1 + d%)")
    print(f"high-amplitude points: {', '.join(hi)} ({len(hi)})")
    ok = all(t168[name(g, 'summer', 0.0)] == CHECK[g] for g in CHECK)
    print("\nCheck against 6zzi (d = 0 is LC_g): " + ", ".join(
        f"LC_{g} {t168[name(g, 'summer', 0.0)]} (6zzi {CHECK[g]})" for g in CHECK) + ("  ok" if ok else "  MISMATCH"))

    print("\nDominance counts: hi168 (pooled over the 9 points, 21 shapes x 2 halves x 4 packs), "
          "hireal8 (real shape pooled), pp72 (real shape, per point); failing hi168 cells by mode")
    print(f"  {'rule':10s}  hi168  hireal8  pp72   km-only  dark-only  both")
    modes = {}
    for g in RULES:
        modes[g] = failure_modes(cells, hi, g)
        k, dk, b = modes[g]
        print(f"  {g:10s}  {t168[g]:5d}  {t8[g]:7d}  {pp[g]:4d}   {k:7d}  {dk:9d}  {b:4d}")

    s2 = [name(2, "summer", d) for d in DS]
    ser = real_series(cells, hi, ("AT_90",) + tuple(s2))
    print("\nReal shape pooled over the 9 points: lag 2, local summer shifted by d; km/B (ex/B) per half and pack")
    print("  half C kWh | " + " ".join(f"{tag(d) + '%':>13s}" for d in DS))
    for (hn, c), row in ser.items():
        print(f"  {hn:4s} {c / 1000:5.1f} | " + " ".join(f"{row[g][0]:7.4f} ({row[g][1]:4.2f})" for g in s2))

    s3 = [name(3, "summer", d) for d in DS]
    print("\nhi168 by d (summer shift): " + " ".join(f"{tag(d)}%" for d in DS))
    for g, row in ((2, s2), (3, s3), (4, [name(4, "summer", d) for d in DS4])):
        ds = DS if g != 4 else DS4
        print(f"  lag {g}: " + " ".join(f"{tag(d)}%:{t168[r]}" for d, r in zip(ds, row)))
    cross = [d for d, a, b in zip(DS, s2, s3) if t168[b] >= t168[a]]
    print(f"  d at which lag 3 >= lag 2: {', '.join(tag(d) + '%' for d in cross) if cross else 'none in DS'}")

    v = lambda b: "held" if b else "refuted"  # noqa: E731
    f1 = sum(nonincreasing([row[g][0] for g in s2]) for row in ser.values())
    up = [name(2, "summer", d) for d in DS if d >= 0]
    k, dk, b = modes[name(2, "summer", -3.0)]
    g4 = (t168[name(4, "summer", 3.0)], t168[name(4, "summer", 0.0)])
    print("\nPredictions")
    print(f"F1 LC_2 real-shape km/B non-increasing in d in all 8 series: {v(f1 == 8)} ({f1} of 8)")
    print(f"F2 LC_2 hi168 non-increasing over d = 0..+3%: {v(nonincreasing([t168[g] for g in up]))} "
          f"({' / '.join(str(t168[g]) for g in up)})")
    print(f"F3 G2s+1 hi168 <= 102: {v(t168[name(2, 'summer', 1.0)] <= 102)} ({t168[name(2, 'summer', 1.0)]})")
    print(f"F4 G2s+3 hi168 <= 25: {v(t168[name(2, 'summer', 3.0)] <= 25)} ({t168[name(2, 'summer', 3.0)]})")
    print(f"F5 G3s-1 hi168 >= 52: {v(t168[name(3, 'summer', -1.0)] >= 52)} ({t168[name(3, 'summer', -1.0)]})")
    print(f"F6 G2w+3 >= 140 and G2s+3 < 103: "
          f"{v(t168[name(2, 'winter', 3.0)] >= 140 and t168[name(2, 'summer', 3.0)] < 103)} "
          f"(winter +3% {t168[name(2, 'winter', 3.0)]}, summer +3% {t168[name(2, 'summer', 3.0)]})")
    print(f"F7 G2s-3 failures mostly involve dark hours: {v(dk + b > k)} (dark only {dk} + both {b} vs km only {k})")
    print(f"F8 G4s+3 < G4s0: {v(g4[0] < g4[1])} ({g4[0]} vs {g4[1]})")


if __name__ == "__main__":
    main()
