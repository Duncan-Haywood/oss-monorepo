"""Milestone 6zzze: do the learned sun corrections (AP, AK, A1, C15, C03, HR) hold on 2025, a year no milestone has
read, when the boat learns from the seasons just before it?

Why: open in every "Next" since 6zzy ("out-of-sample scoring on 2025 sun once NASA POWER publishes the full year").
Every rule from 6zzj to 6zzzd was fixed and ranked on 2005 to 2014 scored against a 2015 to 2024 climatology. NASA
POWER now serves all of 2025 with no fill values at the 30 points (experiments/fetch_sun_2025.py,
experiments/data/sun_30pts_2025.json; fetched 2026-11-17).

Design (fixed here, before any configuration below was run and before the 2025 data were looked at beyond the fetch's
day and fill counts):
  Scored years: 2025 (out of sample) and, as the in-sample reference under the same design, each of 2010 to 2014.
  Learning years: the boat's own log of the k seasons Y - g for a lag set S of {1..5} (every k-subset, k = 1..5: 31
  sets), so 2025 learns from 2020 to 2024 and 2012 from 2007 to 2011. This is the operator's case (learn from the
  seasons just sailed), not the half-split of 6zzi to 6zzzd, so the in-sample numbers here are a new reference, not a
  reproduction. Climatology: 2015 to 2024 as every milestone since 6zx, leave-one-out by year as the code always did
  (rc.climatology_wh drops the year it is built for), so a 2020 to 2024 learning year is judged against the other
  nine climatology years and no 2025 data enters any plan.
  Rules, frozen from 6zzz / 6zzzc: h = d * k^alpha on [0.02, 0.40] with d = mean |r_m - 1| of the pooled month
  ratios: AP (alpha 0), AK (0.5), A1 (1); the fixed clamps C03 (+/-3%) and C15 (+/-15%); HR, the pooled cosine
  (6zzk / 6zzr) at k >= 2; AT_90 (no correction); B the 7-day trailing-mean reference. Payload 50 W, packs 2.5 / 5 /
  10 / 20 kWh, the real shape plus 6zz's 20 swept shapes, nasa world only (no ERA5 for 2025 here), "dominates B" as
  6zv: km >= B's and excess dark hours <= B's.
  Counts per scored year (one year per cell, so 84 (shape, pack) cells, not the 168 two-half cells):
    all84   pooled over all 30 points.
    eq84    per cell, the share of the 30 points at which the rule dominates B on that point's own totals, with
            points where B and the rule both sail 0 km left out of that cell (6zzd's zero-km ties), summed over cells.
    hi84    pooled over the nine high-amplitude points; eq9 their equal-weight count as eq84.
    pp120   real shape only, each (point, pack) its own cell.
  "In-sample range" below means min and max over the five years 2010 to 2014 of a set-mean count.

Predictions (priors in brackets), all on 2025:
  O1 AP k = 3 all84 (mean over its 10 sets) >= AT_90's all84. [75%]
  O2 AP k = 3 all84 lies within the in-sample range. [65%]
  O3 AP k = 3 all84 > C15 k = 3 all84. [70%]
  O4 AP k = 3 all84 >= AK k = 3 >= A1 k = 3. [50%]
  O5 HR k = 3 all84 < AP k = 3 all84. [60%]
  O6 AP k = 3 eq84 >= AT_90's eq84. [60%]
  O7 2025's realised harvest / climatology over the 30 points is within 0.985 to 1.015. [70%]
  O8 AP's set-mean all84 is non-decreasing from k = 1 to k = 3. [55%]
  O9 the best rule-and-k on all84 in 2025 (by set mean) is also within 2 cells of the best in the in-sample mean. [50%]

Run (from research/marine-hull): PYTHONPATH=src python3 experiments/run_oos_2025.py > experiments/results_oos_2025.txt
(stdlib, deterministic; up to 4 processes). --smoke times a handful of keys and prints nothing about results."""
import datetime
import itertools
import json
import os
import statistics as st
import sys
import time
from functools import lru_cache
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import run_blend_transfer as bt  # noqa: E402
import run_fresh_years as fy  # noqa: E402
import run_learned_season as ls  # noqa: E402
import run_level_season as lv  # noqa: E402
import run_multi_season_clamp as mc  # noqa: E402
import run_pack_hotel_tau as pt  # noqa: E402
import run_reml_season as rm  # noqa: E402
import run_reserve_curve as rc  # noqa: E402
import run_season_week as sw  # noqa: E402
import run_self_bias as sb  # noqa: E402
import run_year_pack as yp  # noqa: E402

DATA_2025 = os.path.join(HERE, "data", "sun_30pts_2025.json")
OOS = 2025
INS = (2010, 2011, 2012, 2013, 2014)
YEARS = INS + (OOS,)
SHAPES, PACKS, BASE, HOTEL, PS, N = mc.SHAPES, mc.PACKS, mc.BASE, mc.HOTEL, mc.PS, mc.N
KS = (1, 2, 3, 4, 5)
SETS = {k: tuple(itertools.combinations((1, 2, 3, 4, 5), k)) for k in KS}
ALPHA = {"AP": 0.0, "AK": 0.5, "A1": 1.0}
FIXED = {"C03": 0.03, "C15": 0.15}
TAGS = {k: ("AP", "C03", "C15") if k == 1 else ("AP", "AK", "A1", "C03", "C15", "HR") for k in KS}
TAG_ORDER = ("AP", "AK", "A1", "C03", "C15", "HR")


def rname(tag, s):
    return f"{tag}_{''.join(map(str, s))}"


RULES = ("AT_90",) + tuple(rname(t, s) for k in KS for t in TAGS[k] for s in SETS[k])


def load_2025():
    """Add 2025 to rc.series's per-point dicts (idempotent); 2005 to 2014 come from fy.load."""
    fy.prepare()
    new = json.load(open(DATA_2025))
    d0 = datetime.date(2025, 1, 1)
    for p in bt.PTS:
        s = rc.series(p)
        if "20250101" in s:
            continue
        for i, v in enumerate(new[p]["values"]):
            s[(d0 + datetime.timedelta(days=i)).strftime("%Y%m%d")] = v


def learn_years(yr, s):
    return tuple(sorted(yr - g for g in s))


def half_width(tag, r, k):
    if tag in FIXED:
        return FIXED[tag]
    return min(0.40, max(0.02, sum(abs(x - 1) for x in r) / len(r) * k ** ALPHA[tag]))


@lru_cache(maxsize=64)
def corrections(p, yr, shape):
    out = {}
    for k in KS:
        for s in SETS[k]:
            yrs = learn_years(yr, s)
            r, _level = lv.raw(p, yrs, shape)
            for t in TAGS[k]:
                if t == "HR":
                    (a0, a1, b1), _, _ = rm.hs.hier(p, yrs, shape, "HR")
                    out[rname(t, s)] = rm.am.curve(a0, a1, b1, 1.0)
                else:
                    h = half_width(t, r, k)
                    out[rname(t, s)] = tuple(lv.clamp(x, (1 - h, 1 + h)) for x in r)
    return out


def _init():
    load_2025()


def score(key):
    """((cap, point, year, s0, amp, phi), {rule: (km, excess dark h, None)})."""
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
    for g, cm in corrections(p, yr, shape).items():
        hm = [ls.interp(cm, d) * x for d, x in enumerate(hc)]
        runs[g] = (pt.target(hm, cap, HOTEL), hm)
    for g, (TT, cc) in runs.items():
        taus = [sb.tau_of(1.0 / x) for x in sb.ratios(h, cc, N)]
        km, dark, _days = sb.run(h, TT, cc, a, taus, ones, cap, HOTEL)
        out[g] = (km, dark - idle_dark, None)
    return key, out


def evaluate(keys, procs=4):
    with Pool(procs, initializer=_init) as pool:
        return dict(pool.map(score, keys, chunksize=len(PACKS)))


def dom(t, g):
    return t[g][0] >= t[BASE][0] and t[g][1] <= t[BASE][1]


def tot(cells, keys):
    t = {}
    for k in keys:
        for g, (km, ex, _) in cells[k].items():
            x = t.setdefault(g, [0.0, 0.0])
            x[0] += km
            x[1] += ex
    return t


def counts(cells, yr, points, hi):
    """{footing: {rule: count}} for one scored year."""
    out = {f: dict.fromkeys(RULES, 0.0) for f in ("all84", "eq84", "hi84", "eq9", "pp120")}
    for sh in SHAPES:
        for c in PACKS:
            for f, pts in (("all84", points), ("hi84", hi)):
                t = tot(cells, [(c, p, yr) + sh for p in pts])
                for g in RULES:
                    out[f][g] += dom(t, g)
            for f, pts in (("eq84", points), ("eq9", hi)):
                for g in RULES:
                    n = w = 0
                    for p in pts:
                        x = cells[(c, p, yr) + sh]
                        if x[BASE][0] == 0 and x[g][0] == 0:
                            continue
                        n += 1
                        w += dom(x, g)
                    out[f][g] += w / n if n else 0.0
    for p in points:
        for c in PACKS:
            x = cells[(c, p, yr) + ls.REAL]
            for g in RULES:
                out["pp120"][g] += dom(x, g)
    return out


def setmean(tab, tag, k):
    xs = [tab[rname(tag, s)] for s in SETS[k]]
    return st.mean(xs), min(xs), max(xs)


def realised(yr, points):
    h = sum(sum(fy._sun(p, yr)[1]) for p in points)
    c = sum(sum(fy._clim(p, yr)) for p in points)
    return h / c


def mean_h(yr, points, tag, k):
    xs = [half_width(tag, lv.raw(p, learn_years(yr, s), ls.REAL)[0], k) for p in points for s in SETS[k]]
    return st.mean(xs)


def main():
    load_2025()
    pts = tuple(bt.PTS)
    hi = ls.high_amp_points()
    if "--smoke" in sys.argv:
        keys = [(c, p, yr) + ls.REAL for p in pts[:10] for yr in (2012, OOS) for c in PACKS[:2]]
        t0 = time.time()
        evaluate(keys)
        dt = time.time() - t0
        full = len(pts) * len(YEARS) * len(PACKS) * len(SHAPES)
        print(f"smoke: {len(keys)} keys in {dt:.1f} s; full run {full} keys, about {dt / len(keys) * full / 60:.0f} min")
        return
    keys = [(c, p, yr) + sh for p in pts for yr in YEARS for sh in SHAPES for c in PACKS]
    t0 = time.time()
    cells = evaluate(keys)
    C = {yr: counts(cells, yr, pts, hi) for yr in YEARS}
    print("Milestone 6zzze: learned sun corrections scored on 2025 (out of sample) and on 2010 to 2014 (in-sample "
          "reference), each year learning from the k seasons before it; climatology 2015 to 2024 leave-one-out; 50 W")
    print(f"points 30; high-amplitude nine: {', '.join(hi)}; {len(keys)} scored keys; run {time.time() - t0:.0f} s")
    print("\nRealised harvest / climatology over the 30 points (and the nine):")
    for yr in YEARS:
        print(f"  {yr}: {realised(yr, pts):.4f}  ({realised(yr, hi):.4f})")
    print("\nAP's mean half-width h on the real shape, all 30 points, by k:")
    for yr in YEARS:
        print(f"  {yr}: " + "  ".join(f"k{k} {mean_h(yr, pts, 'AP', k):.3f}" for k in KS))

    foot = ("all84", "eq84", "hi84", "eq9", "pp120")
    print("\nSet-mean count per rule, k and footing: 2025 | in-sample mean [min year, max year] of the set means")
    print("  AT_90: " + " | ".join(f"{f} {C[OOS][f]['AT_90']:.1f} / {st.mean(C[y][f]['AT_90'] for y in INS):.1f} "
                                   f"[{min(C[y][f]['AT_90'] for y in INS):.1f}, "
                                   f"{max(C[y][f]['AT_90'] for y in INS):.1f}]" for f in foot))
    summ = {}
    for k in KS:
        for t in TAG_ORDER:
            if t not in TAGS[k]:
                continue
            row = []
            for f in foot:
                o = setmean(C[OOS][f], t, k)
                ins = [setmean(C[y][f], t, k)[0] for y in INS]
                summ[(t, k, f)] = (o[0], st.mean(ins), min(ins), max(ins), o[1], o[2])
                row.append(f"{f} {o[0]:5.1f} [{o[1]:.0f},{o[2]:.0f}] / {st.mean(ins):5.1f} [{min(ins):.1f}, "
                           f"{max(ins):.1f}]")
            print(f"  {t:3s} k={k}: " + " | ".join(row))

    print("\nPer scored year, set-mean all84 at k = 3 (AT_90 first):")
    for yr in YEARS:
        print(f"  {yr}: AT_90 {C[yr]['all84']['AT_90']:.0f}  " +
              "  ".join(f"{t} {setmean(C[yr]['all84'], t, 3)[0]:.1f}" for t in TAG_ORDER))
    print("\nPer scored year, set-mean eq84 at k = 3:")
    for yr in YEARS:
        print(f"  {yr}: AT_90 {C[yr]['eq84']['AT_90']:.1f}  " +
              "  ".join(f"{t} {setmean(C[yr]['eq84'], t, 3)[0]:.1f}" for t in TAG_ORDER))

    print("\nTotals over the 30 points, real shape, 2025, by pack: km and excess dark h for B, AT_90, AP_123, AK_123,"
          " HR_123")
    for c in PACKS:
        t = tot(cells, [(c, p, OOS) + ls.REAL for p in pts])
        print(f"  {c:5.1f} kWh: " + "  ".join(f"{g} {t[g][0]:.0f} km / {t[g][1]:.0f} h"
                                               for g in (BASE, "AT_90", "AP_123", "AK_123", "HR_123")))

    s = lambda t, k, f="all84": summ[(t, k, f)][0]  # noqa: E731
    at = C[OOS]["all84"]["AT_90"]
    best25 = max(((s(t, k), t, k) for k in KS for t in TAGS[k]))
    bestin = max(((summ[(t, k, "all84")][1], t, k) for k in KS for t in TAGS[k]))
    print("\nPredictions:")
    res = [
        ("O1 AP k=3 all84 >= AT_90", s("AP", 3) >= at, f"{s('AP', 3):.1f} vs {at:.0f}"),
        ("O2 AP k=3 all84 within in-sample range", summ[("AP", 3, "all84")][2] <= s("AP", 3) <= summ[("AP", 3, "all84")][3],
         f"{s('AP', 3):.1f} in [{summ[('AP', 3, 'all84')][2]:.1f}, {summ[('AP', 3, 'all84')][3]:.1f}]"),
        ("O3 AP k=3 > C15 k=3 all84", s("AP", 3) > s("C15", 3), f"{s('AP', 3):.1f} vs {s('C15', 3):.1f}"),
        ("O4 AP >= AK >= A1 at k=3 all84", s("AP", 3) >= s("AK", 3) >= s("A1", 3),
         f"{s('AP', 3):.1f} / {s('AK', 3):.1f} / {s('A1', 3):.1f}"),
        ("O5 HR k=3 < AP k=3 all84", s("HR", 3) < s("AP", 3), f"{s('HR', 3):.1f} vs {s('AP', 3):.1f}"),
        ("O6 AP k=3 eq84 >= AT_90 eq84", s("AP", 3, "eq84") >= C[OOS]["eq84"]["AT_90"],
         f"{s('AP', 3, 'eq84'):.1f} vs {C[OOS]['eq84']['AT_90']:.1f}"),
        ("O7 2025 realised within 0.985 to 1.015", 0.985 <= realised(OOS, pts) <= 1.015, f"{realised(OOS, pts):.4f}"),
        ("O8 AP set-mean all84 non-decreasing k=1..3", s("AP", 1) <= s("AP", 2) <= s("AP", 3),
         f"{s('AP', 1):.1f} / {s('AP', 2):.1f} / {s('AP', 3):.1f}"),
        ("O9 2025's best rule-k within 2 cells of the in-sample best, in-sample",
         summ[(best25[1], best25[2], "all84")][1] >= bestin[0] - 2,
         f"2025 best {best25[1]} k={best25[2]} {best25[0]:.1f} (in-sample {summ[(best25[1], best25[2], 'all84')][1]:.1f});"
         f" in-sample best {bestin[1]} k={bestin[2]} {bestin[0]:.1f} (2025 {s(bestin[1], bestin[2]):.1f})"),
    ]
    for name, ok, detail in res:
        print(f"  {name}: {'held' if ok else 'refuted'} ({detail})")
    print(f"  {sum(ok for _, ok, _ in res)} of {len(res)} held")


if __name__ == "__main__":
    main()
