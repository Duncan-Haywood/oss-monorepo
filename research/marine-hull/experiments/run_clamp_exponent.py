"""Milestone 6zzzc: how should the spread-set clamp scale with the length of the log (h = d * k^alpha, alpha in 0,
0.5, 1, one to five seasons), and do the high-latitude rankings since 6zzq survive once P-30 stops carrying the
pooled count?

Why: 6zzzb's first two "Next" items. (1) 6zzzb fixed the sqrt(k) scale of AK by argument, with no sweep of the
exponent and only at k = 2 and 3; AK had the smallest worst gap (-7.1 at k = 3) but gave up 5.0 cells on all 30
points. (2) 6zzzb found that the pooled high-amplitude count (hi168) sums km and dark hours over the nine points, so
P-30 (far more sun and km than the eight points at 50 to 60 degrees) carries it: swapping the eight band points from
AP's clamp to C15's moved the pooled count by under 1 cell while the two rules differ there by 21. Every
high-latitude claim from 6zzq on rests on hi168, so it needs restating on footings P-30 does not dominate.

Rules (fixed here, before any configuration below was run): d = mean |r_m - 1| of the boat's pooled month ratios
over the k learning seasons (6zzw's `raw`), h = d * k^alpha clamped to [0.02, 0.40]:
  AP  alpha = 0 (6zzy / 6zzz), AK alpha = 0.5 (6zzzb), A1 alpha = 1 (new). At k = 1 the three are one rule (AP).
  C15 the fixed +/-15% clamp (6zzj's LC), the wide reference.
Learning sets: every k-subset of lags {1..5} for k = 1..5 (5, 10, 10, 5 and 1 sets). AP at k = 1; AP, AK, A1 and
C15 at k = 2..5. k = 4 sets share three of four years and k = 5 is a single set, so their brackets are narrow by
construction, not by precision.

Counts (worlds, years, packs, shapes, halves, B and "dominates B" exactly 6zzz's): nasa all168, pp240, hi168, pp72 as
before; and two new footings for the nine high-amplitude points, applied in all three worlds:
  hi8    the pooled count over the eight band points only (hi168 without P-30), 168 cells.
  eq168  per (shape, half, pack) cell, the share of the nine points at which the rule dominates B on that point's own
         five-year totals, summed over the 168 cells: every point weighs one ninth, whatever its km. In [0, 168].
  eqall  the same equal-weight count over all 30 points (nasa world only).
Checks: AP k = 1 reproduces 6zzy per lag (nasa all168 and hi168 in all three worlds); AP, C15 and AK at k = 2, 3
reproduce 6zzzb's means and ranges (nasa all168, hi168 in all three worlds); AT_90 139 / 126 / 25.
Gap: a rule's mean minus the best mean among AP, AK, A1 and C15 at the same k, over nasa all168 and the high-latitude
count in the three worlds; reported three times, with hi168, hi8 and eq168 as the high-latitude count.

Predictions (priors in brackets):
  F1 nasa k = 3: C15 - AP on eq168 is under half of C15 - AP on hi168 (21.2). [60%]
  F2 nasa k = 3: C15 - AP on hi8 is under half of 21.2. [55%]
  F3 reverse k = 3: C15 > AP on eq168. [70%]
  F4 k = 3: AK has the smallest worst gap of the four rules on both the hi168 and the eq168 footing. [50%]
  S1 A1 k = 3 nasa all168 mean < AK's (154.5). [80%]
  S2 A1 k = 3 reverse hi168 mean > AK's (93.3). [55%]
  S3 AP nasa all168 mean >= 159.5 at both k = 4 and k = 5. [55%]
  S4 AK's worst all168 set at k = 4 >= 139. [60%]
  S5 AP's mean h on the nasa all-30 pool at k = 5 < 0.040. [60%]
  S6 at every k from 2 to 5, AK has the smallest worst gap of AP, AK, A1 (hi168 footing). [40%]

Run (from research/marine-hull): PYTHONPATH=src python3 experiments/run_clamp_exponent.py > experiments/results_clamp_exponent.txt
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
import run_k_aware_clamp as ka  # noqa: E402
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
KS = (1, 2, 3, 4, 5)
SETS = {k: tuple(itertools.combinations((1, 2, 3, 4, 5), k)) for k in KS}
ALPHA = {"AP": 0.0, "AK": 0.5, "A1": 1.0}
TAGS = {1: ("AP",), 2: ("AP", "AK", "A1", "C15"), 3: ("AP", "AK", "A1", "C15"), 4: ("AP", "AK", "A1", "C15"),
        5: ("AP", "AK", "A1", "C15")}
EXP = ("AP", "AK", "A1")
WORLDS = mc.WORLDS
AT_ALL, AT_HI, AT_PP240 = mc.AT_ALL, mc.AT_HI, mc.AT_PP240
# 6zzzb (results_k_aware_clamp.txt): mean [min, max] over the sets
REF = {("nasa", "all168"): {"AP": {2: (158.1, 151, 163), 3: (159.5, 155, 162)},
                            "C15": {2: (140.8, 116, 155), 3: (149.3, 123, 160)},
                            "AK": {2: (151.5, 134, 160), 3: (154.5, 136, 160)}},
       ("nasa", "hi168"): {"AP": {2: (70.5, 7, 119), 3: (74.5, 33, 108)},
                           "C15": {2: (92.3, 33, 149), 3: (95.7, 50, 128)},
                           "AK": {2: (78.9, 14, 128), 3: (89.0, 47, 121)}},
       ("cross", "hi168"): {"AP": {2: (53.0, 25, 88), 3: (49.2, 35, 76)},
                            "C15": {2: (49.6, 1, 104), 3: (41.5, 11, 82)},
                            "AK": {2: (59.4, 29, 85), 3: (57.5, 42, 84)}},
       ("reverse", "hi168"): {"AP": {2: (68.4, 9, 104), 3: (73.8, 32, 102)},
                              "C15": {2: (95.5, 43, 147), 3: (100.4, 57, 131)},
                              "AK": {2: (79.1, 17, 115), 3: (93.3, 51, 121)}}}
FOOTINGS = ("hi168", "hi8", "eq168")


def rname(tag, s):
    return mc.rname(tag, s)


def rules():
    return ("AT_90",) + tuple(rname(t, s) for k in KS for t in TAGS[k] for s in SETS[k])


def half_width(tag, r, k):
    if tag == "C15":
        return 0.15
    return min(0.40, max(0.02, ac.spread(r) * k ** ALPHA[tag]))


def corrections(p, hn, shape):
    """{rule: 12 monthly factors} for every tag and learning set, scoring half hn."""
    out = {}
    for k in KS:
        for s in SETS[k]:
            r, _level = lv.raw(p, su.years_of(hn, s), shape)
            for t in TAGS[k]:
                h = half_width(t, r, k)
                out[rname(t, s)] = tuple(lv.clamp(x, (1 - h, 1 + h)) for x in r)
    return out


def score(key):
    """6zzz's cell scorer (`run_multi_season_clamp.score`) for this milestone's rules."""
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
    return key[1:], out


def equal_weight(cells, points, shapes):
    """Sum over (shape, half, pack) of the share of points at which the rule dominates B on its own totals."""
    n = dict.fromkeys(ss.RULES, 0.0)
    for sh in shapes:
        for hn, yrs in ss.HALVES.items():
            for c in PACKS:
                for p in points:
                    t = sb.total(cells, [(c, p, yr) + sh for yr in yrs])
                    for g in ss.RULES:
                        n[g] += sb.dominates(t, g) / len(points)
    return {g: round(x, 3) for g, x in n.items()}


def choices(points, shapes):
    """Per k and exponent tag: mean h."""
    out = {}
    for k in KS:
        tot, n = dict.fromkeys(EXP, 0.0), 0
        for p in points:
            for sh in shapes:
                for hn in ("E", "L"):
                    for s in SETS[k]:
                        r, _level = lv.raw(p, su.years_of(hn, s), sh)
                        n += 1
                        for t in EXP:
                            tot[t] += half_width(t, r, k)
        out[str(k)] = {t: tot[t] / n for t in EXP}
    return out


def run_world(world, procs=4):
    hi = ls.high_amp_points()
    band = tuple(p for p in hi if ka.in_band(p))
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
    out = {"tab": {"hi168": ss.pooled(cells, hi, SHAPES), "pp72": ss.per_point(cells, hi),
                   "hi8": ss.pooled(cells, band, SHAPES), "eq168": equal_weight(cells, hi, SHAPES)},
           "choice_hi": choices(hi, SHAPES)}
    if world == "nasa":
        out["tab"]["all168"] = ss.pooled(cells, pts, SHAPES)
        out["tab"]["pp240"] = ss.per_point(cells, pts)
        out["tab"]["eqall"] = equal_weight(cells, pts, SHAPES)
        out["choice_all"] = choices(pts, SHAPES)
    return out


def summary(tab, tag, k):
    xs = [tab[rname(tag, s)] for s in SETS[k]]
    return st.mean(xs), min(xs), max(xs)


def gaps(T, tag, k, foot):
    cols = [("nasa", "all168")] + [(w, foot) for w in WORLDS]
    best = {c: max(summary(T[c[0]][c[1]], t, k)[0] for t in TAGS[k]) for c in cols}
    return {c: summary(T[c[0]][c[1]], tag, k)[0] - best[c] for c in cols}


def fmt(x):
    m, lo, hi = x
    if isinstance(lo, float) and not float(lo).is_integer() or isinstance(hi, float) and not float(hi).is_integer():
        return "{:6.1f} [{:5.1f},{:5.1f}]".format(m, lo, hi)
    return "{:6.1f} [{:5d},{:5d}]".format(m, int(lo), int(hi))


def main():
    if len(sys.argv) == 3 and sys.argv[1] == "--world":
        json.dump(run_world(sys.argv[2]), sys.stdout)
        return
    env = dict(os.environ, PYTHONPATH=os.path.join(HERE, "..", "src"))
    R = {w: json.loads(subprocess.run([sys.executable, __file__, "--world", w], env=env, check=True,
                                      capture_output=True, text=True).stdout) for w in WORLDS}
    T = {w: R[w]["tab"] for w in WORLDS}
    hi = ls.high_amp_points()
    print("Milestone 6zzzc: the spread clamp's exponent (h = d * k^alpha; AP 0, AK 0.5, A1 1) at one to five "
          "seasons of log, and the high-latitude counts restated without P-30's weight; 2005 to 2014 scored, 2015 to "
          "2024 climatology (50 W)")
    print("sets: every k-subset of lags {1..5} (5, 10, 10, 5, 1); nasa world on all 30 points, cross and reverse at "
          "the nine high-amplitude points")
    print(f"high-amplitude points: {', '.join(hi)}; hi8 drops {', '.join(p for p in hi if not ka.in_band(p))}")

    print("\nChecks:")
    ok_all = True
    for (w, c), want in mc.CHECK_AP.items():
        got = tuple(T[w][c][rname("AP", s)] for s in SETS[1])
        ok = got == want
        ok_all &= ok
        print(f"  {w} {c} AP k=1 per lag {got} (6zzy {want})" + ("  ok" if ok else "  MISMATCH"))
    for (w, c), ref in REF.items():
        for t, byk in ref.items():
            for k, want in byk.items():
                got = summary(T[w][c], t, k)
                ok = abs(got[0] - want[0]) < 0.05 and tuple(got[1:]) == want[1:]
                ok_all &= ok
                print(f"  {w} {c} {t} k={k} {fmt(got)} (6zzzb {want})" + ("  ok" if ok else "  MISMATCH"))
    at = (T["nasa"]["all168"]["AT_90"], T["nasa"]["pp240"]["AT_90"], T["nasa"]["hi168"]["AT_90"])
    ok = at == (AT_ALL, AT_PP240, AT_HI)
    ok_all &= ok
    print(f"  nasa AT_90 all168 / pp240 / hi168 {at} ({AT_ALL}, {AT_PP240}, {AT_HI})" + ("  ok" if ok else
                                                                                        "  MISMATCH"))
    print("  all checks " + ("passed" if ok_all else "DID NOT PASS"))

    cols = [("nasa", "all168"), ("nasa", "eqall"), ("nasa", "pp240")] + \
        [(w, c) for c in FOOTINGS for w in WORLDS] + [(w, "pp72") for w in WORLDS]
    print("\nAT_90 (no correction): " + "; ".join(f"{w} {c} {T[w][c]['AT_90']:g}" for w, c in cols))
    print("\nMean [min, max] over the sets, by k and rule")
    for w, c in cols:
        print(f"  {w} {c}")
        for k in KS:
            print(f"    k={k}: " + "; ".join(f"{t} {fmt(summary(T[w][c], t, k))}" for t in TAGS[k]))

    print("\nFloors (min all168 >= 139 and min nasa hi168 >= 25)")
    for k in KS:
        print(f"  k={k}: " + "; ".join(
            f"{t} {summary(T['nasa']['all168'], t, k)[1]} / {summary(T['nasa']['hi168'], t, k)[1]}" +
            (" both" if summary(T['nasa']['all168'], t, k)[1] >= AT_ALL and
             summary(T['nasa']['hi168'], t, k)[1] >= AT_HI else "") for t in TAGS[k]))

    print("\nC15 - AP by footing (mean over the sets)")
    for k in KS[1:]:
        print(f"  k={k}: " + "; ".join(
            f"{w} " + "/".join(f"{summary(T[w][f], 'C15', k)[0] - summary(T[w][f], 'AP', k)[0]:+.1f}"
                               for f in FOOTINGS) for w in WORLDS) + "  (hi168/hi8/eq168)")

    print("\nGap to the best of AP, AK, A1, C15 at the same k, over nasa all168 and the high-latitude count in each "
          "world; worst gap last")
    WG = {}
    for foot in FOOTINGS:
        print(f"  footing {foot}")
        for k in KS[1:]:
            for t in TAGS[k]:
                g = gaps(T, t, k, foot)
                WG[(foot, k, t)] = min(g.values())
                print(f"    k={k} {t:3s}: " + ", ".join(f"{w} {c} {x:+.1f}" for (w, c), x in g.items()) +
                      f"; worst {WG[(foot, k, t)]:+.1f}")

    print("\nMean half-width AP / AK / A1, all 21 shapes, every set")
    rows = [("nasa all30", R["nasa"]["choice_all"])] + [(w, R[w]["choice_hi"]) for w in WORLDS]
    for name, ch in rows:
        print(f"  {name:10s}: " + "; ".join(
            f"k={k} " + "/".join(f"{ch[str(k)][t]:.3f}" for t in EXP) for k in KS))

    v = lambda b: "held" if b else "refuted"  # noqa: E731
    m = lambda w, c, t, k: summary(T[w][c], t, k)[0]  # noqa: E731
    print("\nPredictions")
    d_hi = m("nasa", "hi168", "C15", 3) - m("nasa", "hi168", "AP", 3)
    d_eq = m("nasa", "eq168", "C15", 3) - m("nasa", "eq168", "AP", 3)
    d_h8 = m("nasa", "hi8", "C15", 3) - m("nasa", "hi8", "AP", 3)
    print(f"F1 nasa k=3 C15-AP on eq168 < half of hi168's ({d_hi:+.1f}): {v(abs(d_eq) < abs(d_hi) / 2)} ({d_eq:+.1f})")
    print(f"F2 nasa k=3 C15-AP on hi8 < half of hi168's: {v(abs(d_h8) < abs(d_hi) / 2)} ({d_h8:+.1f})")
    x = m("reverse", "eq168", "C15", 3) - m("reverse", "eq168", "AP", 3)
    print(f"F3 reverse k=3 C15 > AP on eq168: {v(x > 0)} ({x:+.1f})")
    w_hi = {t: WG[("hi168", 3, t)] for t in TAGS[3]}
    w_eq = {t: WG[("eq168", 3, t)] for t in TAGS[3]}
    b_hi, b_eq = max(w_hi, key=w_hi.get), max(w_eq, key=w_eq.get)
    print(f"F4 k=3 AK smallest worst gap on hi168 and eq168: {v(b_hi == 'AK' and b_eq == 'AK')} "
          f"(hi168 best {b_hi} {w_hi[b_hi]:+.1f}; eq168 best {b_eq} {w_eq[b_eq]:+.1f})")
    x = m("nasa", "all168", "A1", 3)
    print(f"S1 A1 k=3 all168 < AK's 154.5: {v(x < 154.5)} ({x:.1f})")
    x = m("reverse", "hi168", "A1", 3)
    print(f"S2 A1 k=3 reverse hi168 > AK's 93.3: {v(x > 93.3)} ({x:.1f})")
    a4, a5 = m("nasa", "all168", "AP", 4), m("nasa", "all168", "AP", 5)
    print(f"S3 AP all168 >= 159.5 at k=4 and 5: {v(a4 >= 159.5 and a5 >= 159.5)} ({a4:.1f}, {a5:.1f})")
    x = summary(T["nasa"]["all168"], "AK", 4)[1]
    print(f"S4 AK worst all168 set at k=4 >= 139: {v(x >= AT_ALL)} ({x})")
    x = R["nasa"]["choice_all"]["5"]["AP"]
    print(f"S5 AP mean h nasa all30 at k=5 < 0.040: {v(x < 0.040)} ({x:.3f})")
    wins = {k: max(EXP, key=lambda t: WG[("hi168", k, t)]) for k in KS[1:]}
    print(f"S6 AK smallest worst gap of the exponents at every k (hi168): {v(all(x == 'AK' for x in wins.values()))} "
          f"({', '.join(f'k={k} {t}' for k, t in wins.items())})")


if __name__ == "__main__":
    main()
