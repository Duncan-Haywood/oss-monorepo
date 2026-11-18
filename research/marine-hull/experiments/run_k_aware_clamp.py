"""Milestone 6zzzb: does scaling the spread-set clamp with the length of the log (AK, h = d * sqrt(k)), or switching
to the fixed +/-15% clamp at 50 degrees of latitude and above (AB), close AP's high-latitude gap at two and three
seasons without giving up its ordinary-water lead?

Why: 6zzz's first two "Next" items. With two and three seasons of log AP (h = d, the mean |r_m - 1| of the boat's
pooled month ratios, in [0.02, 0.40]) tied the best fixed clamp on all 30 points (159.5 against C03's 159.6 at k = 3)
but its worst gap to the best of C03, C15, AS, AP and AF over the four counts grew to -26.6 (reverse hi168, where C15
is best at 100.4 against AP's 73.8), while the fixed +/-15% clamp had the smallest worst gap (-10.3, all its cost on
ordinary water). 6zzz read the cause as a scale error: d measures noise plus bias, the noise part shrinks like
1/sqrt(k), so AP's clamp narrows with k even where the bias it should admit is large. Two rules follow, both fixed
here before any configuration below was run:
  AK  h = d * sqrt(k), in [0.02, 0.40]: the spread read back on the one-season scale (equal to AP at k = 1).
  AB  AP's clamp below 50 degrees of latitude, C15 (+/-15%) at |latitude| >= 50: the designer's split 6zzz proposed
      ("AP for ordinary water and +/-15% above about 50 degrees"), using only the boat's own position. The band holds
      nine of the 30 points (P-60, P-50, P+50, P+60, A-50, A+50, A+60, North Sea 55, Gulf of Alaska 60) and eight of
      the nine high-amplitude points (all but P-30).

Design (fixed here):
  Learning sets, years, worlds, payload, packs, shapes, halves, B, "dominates B" and the counts are exactly 6zzz's
  (`run_multi_season_clamp`): every pair (k = 2, ten sets) and triple (k = 3, ten) from lags {1..5}; worlds nasa (all
  30 points: all168, pp240; the nine: hi168, pp72), cross (NASA climatology, ERA5 sun) and reverse (ERA5 climatology,
  NASA sun) at the nine. Rules scored: AP, C15 and AK at k = 2 and 3; AB is assembled per cell from AP's (below 50
  degrees) or C15's (at or above) km, dark hours and tau-days, which is exactly what scoring it would produce, since
  every rule's cell depends only on its own monthly factors. HR, C03, AS and AF are not re-run (run time); their
  6zzz means are the reference.
  Checks: AP and C15 at k = 2 and 3 reproduce 6zzz's means and per-set ranges in all three worlds; AT_90 139 / 126 /
  25 (nasa all168, pp240, hi168).
  Gap: a rule's mean minus the best mean at the same k among 6zzz's five rules (C03, C15, AS, AP, AF; constants
  below, copied from results_multi_season_clamp.txt), over nasa all168 and the three hi168 counts; the worst gap is
  the most negative.
  Descriptive: AK's mean h per world and k (the 6zzz table's AP column times sqrt(k), modulo the clamp at 0.40).
Predictions (priors in brackets):
  X1 AK k = 3 nasa all168 mean < AP's (159.5). [75%]
  X2 AK crosses both floors at k = 3 (min all168 >= 139, min nasa hi168 >= 25). [45%]
  X3 AK k = 3 nasa hi168 mean > AP's (74.5). [75%]
  X4 AK k = 3 reverse hi168 mean > AP's (73.8). [80%]
  X5 AK's k = 3 worst gap is smaller than AP's (-26.6). [65%]
  X6 AK's k = 3 worst gap is smaller than C15's (-10.3). [25%]
  X7 AB k = 3 nasa hi168 mean >= 90. [70%]
  X8 AB k = 3 nasa all168 mean > C15's (149.3). [60%]
  X9 AB's k = 3 worst gap is smaller than C15's (-10.3). [40%]
  X10 AB k = 3 cross hi168 mean < AP's (49.2). [60%]

Run (from research/marine-hull): PYTHONPATH=src python3 experiments/run_k_aware_clamp.py > experiments/results_k_aware_clamp.txt
(stdlib, deterministic; each world in its own subprocess with up to 4 worker processes)"""
import json
import math
import os
import statistics as st
import subprocess
import sys
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import run_adaptive_clamp as ac  # noqa: E402
import run_blend_transfer as bt  # noqa: E402
import run_cross_source as cs  # noqa: E402
import run_fresh_years as fy  # noqa: E402
import run_learned_season as ls  # noqa: E402
import run_level_season as lv  # noqa: E402
import run_multi_season_clamp as mc  # noqa: E402
import run_pack_hotel_tau as pt  # noqa: E402
import run_self_bias as sb  # noqa: E402
import run_subset_years as su  # noqa: E402
import run_summer_shift as ss  # noqa: E402
import run_year_pack as yp  # noqa: E402

YEARS, SHAPES, PACKS, BASE = mc.YEARS, mc.SHAPES, mc.PACKS, mc.BASE
HOTEL, PS, N = mc.HOTEL, mc.PS, mc.N
KS = (2, 3)
SETS = mc.SETS
SCORED = ("AP", "C15", "AK")
TAGS = SCORED + ("AB",)
WORLDS = mc.WORLDS
COUNTS = mc.COUNTS
BAND = 50
AT_ALL, AT_HI, AT_PP240 = mc.AT_ALL, mc.AT_HI, mc.AT_PP240
# 6zzz (results_multi_season_clamp.txt): mean [min, max] over the sets, (world, count) -> tag -> k -> summary
REF = {("nasa", "all168"): {"AP": {2: (158.1, 151, 163), 3: (159.5, 155, 162)},
                            "C15": {2: (140.8, 116, 155), 3: (149.3, 123, 160)}},
       ("nasa", "pp240"): {"AP": {2: (132.2, 127, 138), 3: (134.2, 127, 140)},
                           "C15": {2: (125.4, 117, 137), 3: (130.0, 117, 137)}},
       ("nasa", "hi168"): {"AP": {2: (70.5, 7, 119), 3: (74.5, 33, 108)},
                           "C15": {2: (92.3, 33, 149), 3: (95.7, 50, 128)}},
       ("cross", "hi168"): {"AP": {2: (53.0, 25, 88), 3: (49.2, 35, 76)},
                            "C15": {2: (49.6, 1, 104), 3: (41.5, 11, 82)}},
       ("reverse", "hi168"): {"AP": {2: (68.4, 9, 104), 3: (73.8, 32, 102)},
                              "C15": {2: (95.5, 43, 147), 3: (100.4, 57, 131)}}}
# 6zzz: best mean among C03, C15, AS, AP, AF per (world, count) and k
BEST = {2: {("nasa", "all168"): ("C03", 158.2), ("nasa", "hi168"): ("C15", 92.3),
            ("cross", "hi168"): ("AS", 55.5), ("reverse", "hi168"): ("C15", 95.5)},
        3: {("nasa", "all168"): ("C03", 159.6), ("nasa", "hi168"): ("C15", 95.7),
            ("cross", "hi168"): ("AS", 50.5), ("reverse", "hi168"): ("C15", 100.4)}}
GAP_REF = {"AP": -26.6, "C15": -10.3}
HR_REF = mc.HR_REF


def in_band(p):
    return abs(yp.lat_of(p)) >= BAND


def rname(tag, s):
    return mc.rname(tag, s)


def rules():
    return ("AT_90",) + tuple(rname(t, s) for k in KS for t in TAGS for s in SETS[k])


def half_width(tag, r, level, k):
    if tag == "C15":
        return 0.15
    if tag == "AP":
        return ac.half_width("AP", r, level)
    if tag == "AK":
        return min(0.40, max(0.02, ac.spread(r) * math.sqrt(k)))
    raise ValueError(tag)


def corrections(p, hn, shape):
    """{rule: 12 monthly factors} for every scored tag and learning set, scoring half hn."""
    out = {}
    for k in KS:
        for s in SETS[k]:
            r, level = lv.raw(p, su.years_of(hn, s), shape)
            for t in SCORED:
                h = half_width(t, r, level, k)
                out[rname(t, s)] = tuple(lv.clamp(x, (1 - h, 1 + h)) for x in r)
    return out


def score(key):
    """6zzz's cell scorer (`run_multi_season_clamp.score`) for this milestone's rules, AB assembled per cell."""
    world, cap, p, yr, s0, amp, phi = key
    shape = (s0, amp, phi)
    sun, h = fy._sun(p, yr)
    h = list(h)
    hc = ls.scaled(p, yr, shape)[1]
    T = pt.target(hc, cap, HOTEL)
    idle_dark = yp.idle(sun, cap, HOTEL)[1]
    b = mc.sw.run(sun, T, hc, *mc.sw.BASE, cap, HOTEL)
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
    src = "C15" if in_band(p) else "AP"
    for k in KS:
        for s in SETS[k]:
            out[rname("AB", s)] = out[rname(src, s)]
    return key[1:], out


def choices(points, shapes):
    """Per k: AK's mean h (and AP's, for the check against 6zzz's table)."""
    out = {}
    for k in KS:
        n, hk, hp = 0, 0.0, 0.0
        for p in points:
            for sh in shapes:
                for hn in ("E", "L"):
                    for s in SETS[k]:
                        r, level = lv.raw(p, su.years_of(hn, s), sh)
                        n += 1
                        hk += half_width("AK", r, level, k)
                        hp += half_width("AP", r, level, k)
        out[str(k)] = (hk / n, hp / n)
    return out


def run_world(world, procs=4):
    hi = ls.high_amp_points()
    if world == "nasa":
        pts = tuple(bt.PTS)
    else:
        pts = hi
        if world == "cross":
            lv.check_swap(world, pts, cs.use_cross(pts))
        elif world == "reverse":
            lv.check_swap(world, pts, lv.use_reverse(pts))
        else:
            raise ValueError(world)
    fy.prepare()
    keys = [(world, c, p, yr) + sh for p in pts for yr in YEARS for c in PACKS for sh in SHAPES]
    with Pool(procs) as pool:
        cells = dict(pool.map(score, keys, chunksize=8))
    ss.RULES = rules()
    out = {"tab": {"hi168": ss.pooled(cells, hi, SHAPES), "pp72": ss.per_point(cells, hi)},
           "choice_hi": choices(hi, SHAPES)}
    if world == "nasa":
        out["tab"]["all168"] = ss.pooled(cells, pts, SHAPES)
        out["tab"]["pp240"] = ss.per_point(cells, pts)
        out["choice_all"] = choices(pts, SHAPES)
    return out


def summary(tab, tag, k):
    xs = [tab[rname(tag, s)] for s in SETS[k]]
    return st.mean(xs), min(xs), max(xs)


def gaps(T, tag, k):
    return {(w, c): summary(T[w][c], tag, k)[0] - BEST[k][(w, c)][1] for w, c in COUNTS}


def fmt(x):
    return "{:6.1f} [{:3d},{:3d}]".format(*x)


def main():
    if len(sys.argv) == 3 and sys.argv[1] == "--world":
        json.dump(run_world(sys.argv[2]), sys.stdout)
        return
    env = dict(os.environ, PYTHONPATH=os.path.join(HERE, "..", "src"))
    R = {w: json.loads(subprocess.run([sys.executable, __file__, "--world", w], env=env, check=True,
                                      capture_output=True, text=True).stdout) for w in WORLDS}
    T = {w: R[w]["tab"] for w in WORLDS}
    print("Milestone 6zzzb: the k-aware spread clamp (AK, h = d * sqrt(k)) and AP with +/-15% at |latitude| >= 50 "
          "(AB), two and three seasons of log; 2005 to 2014 scored, 2015 to 2024 climatology (50 W)")
    print("sets: every pair (10) and triple (10) of lags from {1..5}; nasa world on all 30 points (all168, pp240) and "
          "the nine (hi168, pp72); cross and reverse at the nine")
    hi = ls.high_amp_points()
    print(f"band points (|lat| >= {BAND}): {', '.join(p for p in bt.PTS if in_band(p))}; "
          f"high-amplitude points outside the band: {', '.join(p for p in hi if not in_band(p))}")

    print("\nChecks (6zzz means and per-set ranges):")
    ok_all = True
    for (w, c), ref in REF.items():
        for t, byk in ref.items():
            for k, want in byk.items():
                got = summary(T[w][c], t, k)
                ok = abs(got[0] - want[0]) < 0.05 and got[1:] == want[1:]
                ok_all &= ok
                print(f"  {w} {c} {t} k={k} {fmt(got)} (6zzz {want})" + ("  ok" if ok else "  MISMATCH"))
    at = (T["nasa"]["all168"]["AT_90"], T["nasa"]["pp240"]["AT_90"], T["nasa"]["hi168"]["AT_90"])
    ok = at == (AT_ALL, AT_PP240, AT_HI)
    ok_all &= ok
    print(f"  nasa AT_90 all168 / pp240 / hi168 {at} ({AT_ALL}, {AT_PP240}, {AT_HI})" + ("  ok" if ok else
                                                                                        "  MISMATCH"))
    print("  all checks " + ("passed" if ok_all else "DID NOT PASS"))

    print("\nPer rule and set: nasa all168 | nasa pp240 | hi168 nasa/cross/reverse | pp72 nasa/cross/reverse")
    for r in rules():
        hs = "/".join(str(T[w]["hi168"][r]) for w in WORLDS)
        pp = "/".join(str(T[w]["pp72"][r]) for w in WORLDS)
        print(f"  {r:8s} | {T['nasa']['all168'][r]:4d} | {T['nasa']['pp240'][r]:4d} | {hs:>12s} | {pp:>9s}")

    cols = [("nasa", "all168"), ("nasa", "pp240"), ("nasa", "hi168"), ("cross", "hi168"), ("reverse", "hi168"),
            ("cross", "pp72"), ("reverse", "pp72")]
    print("\nMean [min, max] over the sets, by k and rule")
    print("  k rule | " + " | ".join(f"{w} {c}".rjust(16) for w, c in cols))
    print("  - AT90 | " + " | ".join(f"{T[w][c]['AT_90']:16d}" for w, c in cols))
    for k in KS:
        for t in TAGS:
            print(f"  {k} {t:4s} | " + " | ".join(fmt(summary(T[w][c], t, k)).rjust(16) for w, c in cols))
        print(f"  {k} HR   | nasa all168 {HR_REF[k][0]}, nasa hi168 {HR_REF[k][1]} (6zzk / 6zzr, not re-run)")

    print("\nFloors (min all168 >= 139 and min nasa hi168 >= 25)")
    for k in KS:
        for t in TAGS:
            a, h = summary(T["nasa"]["all168"], t, k), summary(T["nasa"]["hi168"], t, k)
            print(f"  k={k} {t}: worst {a[1]} / {h[1]}" + ("  crosses both" if a[1] >= AT_ALL and h[1] >= AT_HI
                                                           else ""))

    print("\nGap to 6zzz's best of C03, C15, AS, AP, AF per count")
    for k in KS:
        print(f"  k={k} best: " + "; ".join(f"{w} {c} {b[0]} {b[1]}" for (w, c), b in BEST[k].items()))
        for t in TAGS:
            g = gaps(T, t, k)
            print(f"  k={k} {t}: " + ", ".join(f"{w} {c} {x:+.1f}" for (w, c), x in g.items()) +
                  f"; worst {min(g.values()):+.1f}")

    print("\nMean half-width AK / AP, all 21 shapes, every set")
    rows = [("nasa all30", R["nasa"]["choice_all"])] + [(w, R[w]["choice_hi"]) for w in WORLDS]
    for name, ch in rows:
        print(f"  {name:10s}: " + "; ".join(f"k={k} {ch[str(k)][0]:.3f} / {ch[str(k)][1]:.3f}" for k in KS))

    v = lambda b: "held" if b else "refuted"  # noqa: E731
    m = lambda w, c, t, k: summary(T[w][c], t, k)[0]  # noqa: E731
    wg = lambda t, k: min(gaps(T, t, k).values())  # noqa: E731
    print("\nPredictions")
    x = m("nasa", "all168", "AK", 3)
    print(f"X1 AK k=3 all168 < AP's 159.5: {v(x < 159.5)} ({x:.1f})")
    a3, h3 = summary(T["nasa"]["all168"], "AK", 3), summary(T["nasa"]["hi168"], "AK", 3)
    print(f"X2 AK crosses both floors at k=3: {v(a3[1] >= AT_ALL and h3[1] >= AT_HI)} (worst {a3[1]} / {h3[1]})")
    print(f"X3 AK k=3 nasa hi168 > AP's 74.5: {v(h3[0] > 74.5)} ({h3[0]:.1f})")
    x = m("reverse", "hi168", "AK", 3)
    print(f"X4 AK k=3 reverse hi168 > AP's 73.8: {v(x > 73.8)} ({x:.1f})")
    x = wg("AK", 3)
    print(f"X5 AK k=3 worst gap > AP's -26.6: {v(x > GAP_REF['AP'])} ({x:+.1f})")
    print(f"X6 AK k=3 worst gap > C15's -10.3: {v(x > GAP_REF['C15'])} ({x:+.1f})")
    x = m("nasa", "hi168", "AB", 3)
    print(f"X7 AB k=3 nasa hi168 >= 90: {v(x >= 90)} ({x:.1f})")
    x = m("nasa", "all168", "AB", 3)
    print(f"X8 AB k=3 all168 > C15's 149.3: {v(x > 149.3)} ({x:.1f})")
    x = wg("AB", 3)
    print(f"X9 AB k=3 worst gap > C15's -10.3: {v(x > GAP_REF['C15'])} ({x:+.1f})")
    x = m("cross", "hi168", "AB", 3)
    print(f"X10 AB k=3 cross hi168 < AP's 49.2: {v(x < 49.2)} ({x:.1f})")


if __name__ == "__main__":
    main()
