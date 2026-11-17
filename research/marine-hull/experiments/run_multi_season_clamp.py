"""Milestone 6zzz: does the spread-set clamp (AP) sharpen with two and three seasons of log, and does it beat the
pooled cosine HR there? Plus one variant fixed in advance for the reverse world: AP with a floor of 0.10 when the
learned level is off by more than 5% (AF).

Why: 6zzy's first two "Next" items. With one learning year, AP (h = the mean |r_m - 1| of the boat's own month ratios,
in [0.02, 0.40]) had the smallest worst gap to the best fixed half-width over five settings (-13.8, reverse world),
but gave up 4.8 cells on all 30 points against C03 (147.8 against 152.6). With more seasons of log the year-to-year
noise in the month ratios averages out: in a self-consistent world the ratios should sit closer to 1 (a narrower
clamp, closer to C03's shrinkage), while a product mismatch (cross, reverse) is systematic and should keep them away
from 1 (a wide clamp). If so, AP's two failure modes shrink together. The comparison that matters for the paper's
design table is HR (pooled cosine), the rule 6zzr found crosses both floors (139 on all 30 points, 25 at the nine
high-amplitude points) from three seasons: HR k = 2 151.9 [145, 159], hi 54.0 [18, 80] (6zzk); k = 3 155.5
[150, ...], hi 56.7 [31, ...] (6zzr).

Design (fixed here, before any configuration below was run):
  Learning sets S: every single lag (k = 1, five sets), pair (k = 2, ten) and triple (k = 3, ten) from {1, ..., 5};
  scoring L learns from {2010 - g : g in S}, scoring E from {2009 + g} (6zzi's years_of). r_m and L are 6zzw's raw
  month ratios and level pooled over the years of S (ratio of summed logged harvest to summed scaled climatology,
  `run_level_season.raw`); d = mean |r_m - 1|.
  Rules: C03 and C15 (fixed half-widths; C15 is LC), AS (h = 0.05 if d < 0.10 else 0.30), AP (h = d in [0.02, 0.40]),
  AF (AP's h, raised to at least 0.10 when |L - 1| > 0.05), all at k = 2 and 3; AP and AF at k = 1. In the nasa world
  only, HR at k = 2 and 3 (6zzj's pooled cosine, `run_reml_season.corrections`, unchanged). AT_90 is no correction.
  Worlds: nasa (all 30 points: all168, pp240; and the nine: hi168, pp72), cross (NASA climatology, ERA5 sun) and
  reverse (ERA5 climatology, NASA sun) at the nine (hi168, pp72); 6zzy's era5 world is dropped to keep the run
  inside a session (it behaved like nasa in 6zzu to 6zzy). Payload, packs, shapes, halves, B, "dominates B": exactly
  as 6zzx and 6zzy.
  Checks: AP_g at k = 1 reproduces 6zzy's AP per lag in all three worlds; C15 at k = 2 and 3 reproduces 6zzk's and
  6zzi's LC (k = 2 mean 140.8, hi 92.3; k = 3 149.3 [123, 160], hi 95.7 [50, 128]); HR reproduces 6zzk (151.9,
  hi 54.0) and 6zzr (155.5, hi 56.7).
  Summaries per rule, k and count: mean [min, max] over the sets. "Crosses both floors" at k: min all168 >= 139 and
  min nasa hi168 >= 25. "Best" in a (world, count) at k: the best mean among C03, C15, AS, AP, AF at that k.
  Descriptive: AP's mean h and AS's wide share per world and k (nasa on all 30 points and on the nine).
Predictions (priors in brackets):
  Z1 AP's k = 2 nasa all168 mean >= its k = 1 mean (6zzy 147.8). [65%]
  Z2 AP's k = 2 nasa all168 mean >= HR's k = 2 mean. [45%]
  Z3 AP's k = 3 nasa all168 mean >= HR's k = 3 mean. [35%]
  Z4 AP crosses both floors at k = 3 (as HR does). [50%]
  Z5 AP's nasa hi168 mean > HR's at k = 3. [80%]
  Z6 The spread sharpens: AP's mean h on nasa all 30 points falls from k = 1 to k = 3, while in cross it stays above
     0.10 at k = 3. [60%]
  Z7 A tight fixed clamp still beats the setting used since 6zzj at k = 3: C03's nasa all168 mean > C15's. [60%]
  Z8 AF lifts the reverse world at k = 1 (reverse hi168 mean > AP's) and costs at most 2 cells on nasa all168. [40%]
  Z9 In cross, AP's hi168 mean rises with k (k = 1 < k = 2 < k = 3). [55%]
  Z10 At k = 3, AP's worst gap to "best" over nasa all168 and the three hi168 counts is smaller than C03's and
      C15's. [60%]

Run (from research/marine-hull): PYTHONPATH=src python3 experiments/run_multi_season_clamp.py > experiments/results_multi_season_clamp.txt
(stdlib, deterministic; each world in its own subprocess with up to 4 worker processes)"""
import itertools
import json
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
import run_pack_hotel_tau as pt  # noqa: E402
import run_reml_season as rm  # noqa: E402
import run_season_week as sw  # noqa: E402
import run_self_bias as sb  # noqa: E402
import run_subset_years as su  # noqa: E402
import run_summer_shift as ss  # noqa: E402
import run_year_pack as yp  # noqa: E402

YEARS, SHAPES, PACKS, BASE = ac.YEARS, ac.SHAPES, ac.PACKS, ac.BASE
HOTEL, PS, N = ac.HOTEL, ac.PS, ac.N
KS = (1, 2, 3)
SETS = {k: tuple(itertools.combinations((1, 2, 3, 4, 5), k)) for k in KS}
MULTI = ("C03", "C15", "AS", "AP", "AF")
TAGS_K = {1: ("AP", "AF"), 2: MULTI, 3: MULTI}
WORLDS = ("nasa", "cross", "reverse")
AT_ALL, AT_HI, AT_PP240 = 139, 25, 126
FIXED_H = {"C03": 0.03, "C15": 0.15}
# 6zzy (results_adaptive_clamp.txt) AP per lag: nasa all168, and hi168 per world
CHECK_AP = {("nasa", "all168"): (141, 146, 159, 160, 133), ("nasa", "hi168"): (61, 134, 12, 98, 59),
            ("cross", "hi168"): (17, 87, 24, 79, 57), ("reverse", "hi168"): (62, 134, 8, 87, 63)}
AP_K1 = {("nasa", "all168"): 147.8, ("nasa", "hi168"): 72.8, ("cross", "hi168"): 52.8, ("reverse", "hi168"): 70.8}
LC_REF = {2: (140.8, 92.3), 3: (149.3, 123, 160, 95.7, 50, 128)}
HR_REF = {2: (151.9, 54.0), 3: (155.5, 56.7)}
COUNTS = (("nasa", "all168"), ("nasa", "hi168"), ("cross", "hi168"), ("reverse", "hi168"))


def rname(tag, s):
    return f"{tag}_{''.join(map(str, s))}"


def rules(world):
    out = ["AT_90"]
    for k in KS:
        tags = TAGS_K[k] + (("HR",) if world == "nasa" and k > 1 else ())
        out += [rname(t, s) for t in tags for s in SETS[k]]
    return tuple(out)


def half_width(tag, r, level):
    if tag in FIXED_H:
        return FIXED_H[tag]
    if tag == "AF":
        h = ac.half_width("AP", r, level)
        return max(h, 0.10) if abs(level - 1) > 0.05 else h
    return ac.half_width(tag, r, level)


def corrections(p, hn, shape, with_hr=False):
    """{rule: 12 monthly factors} for every tag and learning set, scoring half hn."""
    out = {}
    for k in KS:
        for s in SETS[k]:
            yrs = su.years_of(hn, s)
            r, level = lv.raw(p, yrs, shape)
            for t in TAGS_K[k]:
                h = half_width(t, r, level)
                out[rname(t, s)] = tuple(lv.clamp(x, (1 - h, 1 + h)) for x in r)
            if with_hr and k > 1:
                (a0, a1, b1), _, _ = rm.hs.hier(p, yrs, shape, "HR")  # rm.corrections' HR, without its REML fits
                out[rname("HR", s)] = rm.am.curve(a0, a1, b1, 1.0)
    return out


def score(key):
    """((world, cap, point, year, s0, amp, phi), {rule: (km, excess dark h, tau-days)}); 6zzy's machinery."""
    world, cap, p, yr, s0, amp, phi = key
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
    for g, cm in corrections(p, fy.half_of(yr), shape, world == "nasa").items():
        hm = [ls.interp(cm, d) * x for d, x in enumerate(hc)]
        runs[g] = (pt.target(hm, cap, HOTEL), hm)
    for g, (TT, cc) in runs.items():
        taus = [sb.tau_of(1.0 / x) for x in sb.ratios(h, cc, N)]
        km, dark, days = sb.run(h, TT, cc, a, taus, ones, cap, HOTEL)
        out[g] = (km, dark - idle_dark, days)
    return key[1:], out


def choices(points, shapes):
    """Per k: AP's mean h and AS's share sent wide, over points, shapes, both halves and every set."""
    out = {}
    for k in KS:
        n, hp, ws = 0, 0.0, 0
        for p in points:
            for sh in shapes:
                for hn in ("E", "L"):
                    for s in SETS[k]:
                        r, level = lv.raw(p, su.years_of(hn, s), sh)
                        n += 1
                        hp += ac.half_width("AP", r, level)
                        ws += ac.half_width("AS", r, level) > 0.05
        out[str(k)] = (hp / n, ws / n)
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
    ss.RULES = rules(world)
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


def best(T, w, c, k):
    return max((summary(T[w][c], t, k)[0], t) for t in MULTI)


def worst_gap(T, tag, k):
    return min(summary(T[w][c], tag, k)[0] - best(T, w, c, k)[0] for w, c in COUNTS)


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
    print("Milestone 6zzz: the spread-set clamp (AP) and its level-floored variant (AF) with one, two and three "
          "seasons of log, against C03, C15 (= LC), AS and HR; 2005 to 2014 scored, 2015 to 2024 climatology (50 W)")
    print("sets: every single lag (5), pair (10) and triple (10) from {1..5}; nasa world on all 30 points "
          "(all168, pp240) and the nine (hi168, pp72); cross and reverse at the nine")

    print("\nChecks:")
    for (w, c), want in CHECK_AP.items():
        got = tuple(T[w][c][rname("AP", (g,))] for g in (1, 2, 3, 4, 5))
        print(f"  {w} {c} AP k=1 per lag {got} (6zzy {want})" + ("  ok" if got == want else "  MISMATCH"))
    for (w, c), want in AP_K1.items():
        m = summary(T[w][c], "AP", 1)[0]
        print(f"  {w} {c} AP k=1 mean {m:.1f} (6zzy {want})" + ("  ok" if abs(m - want) < 0.05 else "  MISMATCH"))
    at = (T["nasa"]["all168"]["AT_90"], T["nasa"]["pp240"]["AT_90"], T["nasa"]["hi168"]["AT_90"])
    print(f"  nasa AT_90 all168 / pp240 / hi168 {at} ({AT_ALL}, {AT_PP240}, {AT_HI})" +
          ("  ok" if at == (AT_ALL, AT_PP240, AT_HI) else "  MISMATCH"))
    for k in (2, 3):
        a, h = summary(T["nasa"]["all168"], "C15", k), summary(T["nasa"]["hi168"], "C15", k)
        ref = LC_REF[k]
        ok = abs(a[0] - ref[0]) < 0.05 and abs(h[0] - ref[-3 if k == 3 else 1]) < 0.05
        if k == 3:
            ok = ok and (a[1], a[2], h[1], h[2]) == (ref[1], ref[2], ref[4], ref[5])
        print(f"  C15 k={k} all168 {fmt(a)}, hi168 {fmt(h)} (LC {ref})" + ("  ok" if ok else "  MISMATCH"))
        a, h = summary(T["nasa"]["all168"], "HR", k), summary(T["nasa"]["hi168"], "HR", k)
        ok = abs(a[0] - HR_REF[k][0]) < 0.05 and abs(h[0] - HR_REF[k][1]) < 0.05
        print(f"  HR k={k} all168 {fmt(a)}, hi168 {fmt(h)} (6zzk / 6zzr {HR_REF[k]})" + ("  ok" if ok else
                                                                                         "  MISMATCH"))

    print("\nPer rule and set: nasa all168 | nasa pp240 | hi168 nasa/cross/reverse | pp72 nasa/cross/reverse")
    for r in rules("nasa"):
        hi = "/".join(str(T[w]["hi168"][r]) if r in T[w]["hi168"] else "-" for w in WORLDS)
        pp = "/".join(str(T[w]["pp72"][r]) if r in T[w]["pp72"] else "-" for w in WORLDS)
        print(f"  {r:8s} | {T['nasa']['all168'][r]:4d} | {T['nasa']['pp240'][r]:4d} | {hi:>12s} | {pp:>9s}")

    cols = [("nasa", "all168"), ("nasa", "pp240"), ("nasa", "hi168"), ("cross", "hi168"), ("reverse", "hi168"),
            ("cross", "pp72"), ("reverse", "pp72")]
    print("\nMean [min, max] over the sets, by k and rule")
    print("  k rule | " + " | ".join(f"{w} {c}".rjust(16) for w, c in cols))
    print("  - AT90 | " + " | ".join(f"{T[w][c]['AT_90']:16d}" for w, c in cols))
    for k in KS:
        for t in TAGS_K[k] + (("HR",) if k > 1 else ()):
            cells = [fmt(summary(T[w][c], t, k)).rjust(16) if rname(t, SETS[k][0]) in T[w][c] else "-".rjust(16)
                     for w, c in cols]
            print(f"  {k} {t:4s} | " + " | ".join(cells))

    print("\nFloors (min all168 >= 139 and min nasa hi168 >= 25)")
    for k in KS:
        for t in TAGS_K[k] + (("HR",) if k > 1 else ()):
            a, h = summary(T["nasa"]["all168"], t, k), summary(T["nasa"]["hi168"], t, k)
            print(f"  k={k} {t}: worst {a[1]} / {h[1]}" + ("  crosses both" if a[1] >= AT_ALL and h[1] >= AT_HI
                                                           else ""))

    print("\nBest of C03, C15, AS, AP, AF per count at k = 2 and 3, and each rule's gap")
    for k in (2, 3):
        for w, c in COUNTS:
            b = best(T, w, c, k)
            gaps = ", ".join(f"{t} {summary(T[w][c], t, k)[0] - b[0]:+.1f}" for t in MULTI)
            print(f"  k={k} {w} {c}: best {b[1]} {b[0]:.1f}; {gaps}")
        print(f"  k={k} worst gap: " + ", ".join(f"{t} {worst_gap(T, t, k):+.1f}" for t in MULTI))

    print("\nAdaptive choices: AP mean h / AS share sent wide, all 21 shapes, every set")
    rows = [("nasa all30", R["nasa"]["choice_all"])] + [(w, R[w]["choice_hi"]) for w in WORLDS]
    for name, ch in rows:
        print(f"  {name:10s}: " + "; ".join(f"k={k} {ch[str(k)][0]:.3f} / {ch[str(k)][1]:.3f}" for k in KS))

    v = lambda b: "held" if b else "refuted"  # noqa: E731
    m = lambda w, c, t, k: summary(T[w][c], t, k)[0]  # noqa: E731
    print("\nPredictions")
    print(f"Z1 AP k=2 all168 >= 147.8: {v(m('nasa', 'all168', 'AP', 2) >= 147.8)} "
          f"({m('nasa', 'all168', 'AP', 2):.1f})")
    print(f"Z2 AP k=2 all168 >= HR k=2: {v(m('nasa', 'all168', 'AP', 2) >= m('nasa', 'all168', 'HR', 2))} "
          f"({m('nasa', 'all168', 'AP', 2):.1f} against {m('nasa', 'all168', 'HR', 2):.1f})")
    print(f"Z3 AP k=3 all168 >= HR k=3: {v(m('nasa', 'all168', 'AP', 3) >= m('nasa', 'all168', 'HR', 3))} "
          f"({m('nasa', 'all168', 'AP', 3):.1f} against {m('nasa', 'all168', 'HR', 3):.1f})")
    a3, h3 = summary(T["nasa"]["all168"], "AP", 3), summary(T["nasa"]["hi168"], "AP", 3)
    print(f"Z4 AP crosses both floors at k=3: {v(a3[1] >= AT_ALL and h3[1] >= AT_HI)} (worst {a3[1]} / {h3[1]})")
    print(f"Z5 AP k=3 nasa hi168 > HR's: {v(h3[0] > m('nasa', 'hi168', 'HR', 3))} "
          f"({h3[0]:.1f} against {m('nasa', 'hi168', 'HR', 3):.1f})")
    ca, cc = R["nasa"]["choice_all"], R["cross"]["choice_hi"]
    print(f"Z6 AP mean h falls k=1 -> 3 on nasa all30, cross k=3 > 0.10: "
          f"{v(ca['3'][0] < ca['1'][0] and cc['3'][0] > 0.10)} "
          f"(nasa {ca['1'][0]:.3f} -> {ca['3'][0]:.3f}; cross k=3 {cc['3'][0]:.3f})")
    print(f"Z7 C03 k=3 all168 > C15's: {v(m('nasa', 'all168', 'C03', 3) > m('nasa', 'all168', 'C15', 3))} "
          f"({m('nasa', 'all168', 'C03', 3):.1f} against {m('nasa', 'all168', 'C15', 3):.1f})")
    rf, ra = m("reverse", "hi168", "AF", 1), m("reverse", "hi168", "AP", 1)
    nf, na = m("nasa", "all168", "AF", 1), m("nasa", "all168", "AP", 1)
    print(f"Z8 AF k=1 reverse > AP and nasa all168 cost <= 2: {v(rf > ra and na - nf <= 2)} "
          f"(reverse {rf:.1f} against {ra:.1f}; all168 {nf:.1f} against {na:.1f})")
    cr = [m("cross", "hi168", "AP", k) for k in KS]
    print(f"Z9 cross AP hi168 rises with k: {v(cr[0] < cr[1] < cr[2])} ({', '.join(f'{x:.1f}' for x in cr)})")
    g = {t: worst_gap(T, t, 3) for t in MULTI}
    print(f"Z10 AP k=3 worst gap smaller than C03's and C15's: {v(g['AP'] > g['C03'] and g['AP'] > g['C15'])} "
          f"({', '.join(f'{t} {x:+.1f}' for t, x in g.items())})")


if __name__ == "__main__":
    main()
