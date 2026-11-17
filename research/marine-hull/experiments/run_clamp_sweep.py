"""Milestone 6zzx: how wide should the clamp on the one-season learned month ratios be? A sweep of half-widths fixed
before the run, scored on all 30 points (NASA POWER) and at the nine high-amplitude points in four irradiance worlds.

Why: 6zzw's first "Next". Since 6zzj every one-season correction clamped the learned month ratios to [0.85, 1.15], a
value chosen once and never swept. 6zzw found the clamp binding on the monthly swing, not the level, and its one
alternative ([0.70, 1.30], LW) lifted the cross world (NASA climatology, ERA5 sun) from 45.2 to 61.6 of 168 while
changing the self-consistent worlds little. That alternative was chosen after 6zzv saw the clamp bind, and it was
scored only at the nine high-amplitude points. On the 30-point pool, 6zzt found that more correction was worse in
every direction tried. So the open question is whether a wider clamp is a general improvement or a high-latitude /
product-mismatch one that the 30-point pool pays for, and whether one half-width is safe everywhere.

Design (fixed here, before any configuration below was run):
  Rule C<h>_g: 6zzj's raw learned monthly ratios r_m on the one year at lag g (the same r_m as 6zzw's LC,
  `run_level_season.raw`), clamped to [1 - h, 1 + h], interpolated and applied through AT_90's machinery exactly as
  6zzw. Half-widths h in 0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.40 (tags C05 to C40); lags 1 to 5. C15 is 6zzw's LC,
  C30 is 6zzw's LW. AT_90 is no correction.
  Worlds: "nasa" scored at all 30 points (counts all168, pp240, and hi168 / pp72 from the nine high-amplitude points
  of the same cells); "era5", "cross" and "reverse" exactly as 6zzw, at the nine points only (hi168, pp72).
  Everything else (payload 50 W, packs, the 21 shapes, halves, B, "dominates B", local summer) as 6zzw.
  Checks: C15 reproduces 6zzj's all168 (97, 117, 132, 152, 111) and 6zzw's LC hi168 in every world; C30 reproduces
  6zzw's LW hi168 in every world; AT_90 all168 139, pp240 126.
  Descriptive: per world, the share of real-shape raw month ratios outside [1 - h, 1 + h] for each h (all 30 points
  for nasa as well as the nine); failure modes (km only / dark only / both) of the all168 cells in nasa and of the
  hi168 cells in cross and reverse for C05, C15, C30, C40.
Predictions (priors in brackets; "mean" = mean over the five lags of the named count):
  K1 On the 30-point pool the current clamp is not too narrow: the h with the best all168 mean is <= 0.15. [60%]
  K2 On the 30-point pool the all168 mean does not rise from 0.10 upward (non-increasing over 0.10 ... 0.40). [40%]
  K3 No half-width reaches no correction on the 30-point pool: every all168 mean < 139. [75%]
  K4 In cross the hi168 mean is non-decreasing in h over the whole sweep. [45%]
  K5 In cross the best h on hi168 is >= 0.30. [60%]
  K6 In the NASA world at the nine points the clamp hardly matters above 0.15: |C40 - C15| hi168 mean <= 10. [50%]
  K7 A narrow clamp gives up most of the high-latitude lead: nasa hi168 C05 mean - 25 < 0.5 x (C15 mean - 25). [50%]
  K8 Per point on all 30 points the current clamp is not too narrow: best h on pp240 mean is <= 0.15. [50%]
  K9 Reverse (a brighter plan than sea) does not punish a wide clamp: C40 hi168 mean >= C15's. [50%]
  K10 One half-width is safe everywhere: some h has an all168 mean within 5 of the best h's in nasa, and an hi168
      mean within 5 of the best h's in each of the four worlds. [30%]

Run (from research/marine-hull): PYTHONPATH=src python3 experiments/run_clamp_sweep.py > experiments/results_clamp_sweep.txt
(stdlib, deterministic; each world in its own subprocess with up to 4 worker processes)"""
import json
import os
import statistics as st
import subprocess
import sys
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import run_blend_transfer as bt  # noqa: E402
import run_cross_source as cs  # noqa: E402
import run_era5_rules as er  # noqa: E402
import run_fresh_years as fy  # noqa: E402
import run_learned_season as ls  # noqa: E402
import run_level_season as lv  # noqa: E402
import run_pack_hotel_tau as pt  # noqa: E402
import run_season_week as sw  # noqa: E402
import run_self_bias as sb  # noqa: E402
import run_subset_years as su  # noqa: E402
import run_summer_shift as ss  # noqa: E402
import run_year_pack as yp  # noqa: E402

LAGS, YEARS, REAL, SHAPES, PACKS, BASE = er.LAGS, er.YEARS, er.REAL, er.SHAPES, er.PACKS, er.BASE
HOTEL, PS, N = lv.HOTEL, lv.PS, lv.N
H = (0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.40)
TAGS = tuple(f"C{round(h * 100):02d}" for h in H)
RULES = ("AT_90",) + tuple(f"{t}_{g}" for t in TAGS for g in LAGS)
WORLDS = ("nasa", "era5", "cross", "reverse")
AT_ALL, AT_PP240 = 139, 126
CHECK_ALL = (97, 117, 132, 152, 111)
# 6zzw's hi168 (results_level_season.txt): LC = C15, LW = C30
CHECK_HI = {"nasa": ((77, 153, 1, 124, 50), (83, 147, 1, 126, 50)),
            "era5": ((49, 100, 16, 78, 44), (56, 111, 17, 70, 45)),
            "cross": ((12, 104, 0, 68, 42), (51, 106, 14, 91, 46)),
            "reverse": ((79, 158, 2, 120, 60), (85, 145, 2, 126, 60))}


def corrections(p, hn, shape):
    """{rule: 12 monthly factors} for every half-width and lag, scoring half hn."""
    out = {}
    for g in LAGS:
        r = lv.raw(p, su.years_of(hn, (g,)), shape)[0]
        for h, t in zip(H, TAGS):
            out[f"{t}_{g}"] = tuple(lv.clamp(x, (1 - h, 1 + h)) for x in r)
    return out


def score(key):
    """((cap, point, year, s0, amp, phi), {rule: (km, excess dark h, tau-days)}); lv.score's machinery."""
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


def outside(points):
    """{tag: share of real-shape raw month ratios outside [1 - h, 1 + h]} over points, both halves, five lags."""
    xs = [x for p in points for hn in ("E", "L") for g in LAGS for x in lv.raw(p, su.years_of(hn, (g,)), REAL)[0]]
    return {t: sum(not 1 - h <= x <= 1 + h for x in xs) / len(xs) for h, t in zip(H, TAGS)}


def modes(cells, pts, rules):
    return {r: ss.failure_modes(cells, pts, r) for r in rules}


def run_world(world):
    hi = ls.high_amp_points()
    if world == "nasa":
        pts = tuple(bt.PTS)
    else:
        pts = hi
        if world == "era5":
            er.use_era5(pts)
        elif world == "cross":
            lv.check_swap(world, pts, cs.use_cross(pts))
        elif world == "reverse":
            lv.check_swap(world, pts, lv.use_reverse(pts))
        else:
            raise ValueError(world)
    fy.prepare()
    keys = [(c, p, yr) + sh for p in pts for yr in YEARS for c in PACKS for sh in SHAPES]
    with Pool(4) as pool:
        cells = dict(pool.map(score, keys, chunksize=8))
    ss.RULES = RULES
    sel = ("AT_90",) + tuple(f"{t}_{g}" for t in ("C05", "C15", "C30", "C40") for g in LAGS)
    out = {"tab": {"hi168": ss.pooled(cells, hi, SHAPES), "pp72": ss.per_point(cells, hi)},
           "out_hi": outside(hi), "modes_hi": modes(cells, hi, sel)}
    if world == "nasa":
        out["tab"]["all168"] = ss.pooled(cells, pts, SHAPES)
        out["tab"]["pp240"] = ss.per_point(cells, pts)
        out["out_all"] = outside(pts)
        out["modes_all"] = modes(cells, pts, sel)
    return out


def mean_of(tab, t):
    xs = [tab[f"{t}_{g}"] for g in LAGS]
    return st.mean(xs), min(xs), max(xs)


def best(tab):
    """(tag, mean) of the half-width with the highest five-lag mean; ties go to the narrower clamp."""
    return max(((t, mean_of(tab, t)[0]) for t in TAGS), key=lambda x: (x[1], -TAGS.index(x[0])))


def main():
    if len(sys.argv) == 3 and sys.argv[1] == "--world":
        json.dump(run_world(sys.argv[2]), sys.stdout)
        return
    env = dict(os.environ, PYTHONPATH=os.path.join(HERE, "..", "src"))
    R = {w: json.loads(subprocess.run([sys.executable, __file__, "--world", w], env=env, check=True,
                                      capture_output=True, text=True).stdout) for w in WORLDS}
    T = {w: R[w]["tab"] for w in WORLDS}
    print("Milestone 6zzx: clamp half-width sweep for the one-season learned month ratios; 2005 to 2014 scored, "
          "2015 to 2024 climatology (50 W)")
    print(f"half-widths: {', '.join(f'{t} = {h:.2f}' for t, h in zip(TAGS, H))}")
    print("nasa world: all 30 points (all168, pp240) and the nine high-amplitude points (hi168, pp72); era5, cross "
          "(NASA climatology, ERA5 sun), reverse (ERA5 climatology, NASA sun): nine points only")

    print("\nChecks:")
    got = tuple(T["nasa"]["all168"][f"C15_{g}"] for g in LAGS)
    print(f"  nasa all168 C15 {got} (6zzj {CHECK_ALL})" + ("  ok" if got == CHECK_ALL else "  MISMATCH"))
    at = (T["nasa"]["all168"]["AT_90"], T["nasa"]["pp240"]["AT_90"])
    print(f"  nasa AT_90 all168 / pp240 {at} ({AT_ALL}, {AT_PP240})" + ("  ok" if at == (AT_ALL, AT_PP240) else
                                                                        "  MISMATCH"))
    for w, (c15, c30) in CHECK_HI.items():
        g15 = tuple(T[w]["hi168"][f"C15_{g}"] for g in LAGS)
        g30 = tuple(T[w]["hi168"][f"C30_{g}"] for g in LAGS)
        print(f"  {w} hi168 C15 {g15}, C30 {g30}" + ("  ok" if (g15, g30) == (c15, c30) else "  MISMATCH"))

    print("\nPer half-width and lag: nasa all168 | nasa pp240 | hi168 nasa/era5/cross/reverse | pp72 "
          "nasa/era5/cross/reverse")
    for r in RULES:
        hi = "/".join(str(T[w]["hi168"][r]) for w in WORLDS)
        pp = "/".join(str(T[w]["pp72"][r]) for w in WORLDS)
        print(f"  {r:6s} | {T['nasa']['all168'][r]:4d} | {T['nasa']['pp240'][r]:4d} | {hi:>16s} | {pp:>12s}")

    print("\nFive-lag mean [min, max] by half-width")
    cols = [("nasa", "all168"), ("nasa", "pp240")] + [(w, "hi168") for w in WORLDS] + [("cross", "pp72")]
    print("  h    | " + " | ".join(f"{w} {c}".rjust(17) for w, c in cols))
    print("  AT90 | " + " | ".join(f"{T[w][c]['AT_90']:17d}" for w, c in cols))
    for h, t in zip(H, TAGS):
        print(f"  {h:.2f} | " + " | ".join("{:6.1f} [{:3d},{:3d}]".format(*mean_of(T[w][c], t)).rjust(17)
                                           for w, c in cols))

    print("\nShare of real-shape raw month ratios outside [1 - h, 1 + h]")
    print("  h    | nasa all30 | " + " | ".join(f"{w:>7s}" for w in WORLDS))
    for h, t in zip(H, TAGS):
        print(f"  {h:.2f} | {R['nasa']['out_all'][t]:10.3f} | " + " | ".join(f"{R[w]['out_hi'][t]:7.3f}"
                                                                         for w in WORLDS))

    print("\nFailing cells by mode (km only / dark only / both)")
    blocks = [("nasa all168", R["nasa"]["modes_all"])] + [(f"{w} hi168", R[w]["modes_hi"]) for w in
                                                          ("cross", "reverse")]
    for name, md in blocks:
        print(f"  {name}: AT_90 " + "/".join(map(str, md["AT_90"])))
        for t in ("C05", "C15", "C30", "C40"):
            print(f"    {t}: " + "; ".join("lag {} {}/{}/{}".format(g, *md[f"{t}_{g}"]) for g in LAGS))

    v = lambda b: "held" if b else "refuted"  # noqa: E731
    m = lambda w, c, t: mean_of(T[w][c], t)[0]  # noqa: E731
    print("\nPredictions")
    b_all = best(T["nasa"]["all168"])
    print(f"K1 best all168 h <= 0.15: {v(TAGS.index(b_all[0]) <= 2)} ({b_all[0]}, {b_all[1]:.1f})")
    seq = [m("nasa", "all168", t) for t in TAGS[1:]]
    print(f"K2 all168 non-increasing from 0.10: {v(all(a >= b for a, b in zip(seq, seq[1:])))} "
          f"({', '.join(f'{x:.1f}' for x in seq)})")
    print(f"K3 every all168 mean < 139: {v(all(m('nasa', 'all168', t) < AT_ALL for t in TAGS))} "
          f"(best {b_all[1]:.1f})")
    seq = [m("cross", "hi168", t) for t in TAGS]
    print(f"K4 cross hi168 non-decreasing in h: {v(all(a <= b for a, b in zip(seq, seq[1:])))} "
          f"({', '.join(f'{x:.1f}' for x in seq)})")
    b_cr = best(T["cross"]["hi168"])
    print(f"K5 cross best h >= 0.30: {v(TAGS.index(b_cr[0]) >= 5)} ({b_cr[0]}, {b_cr[1]:.1f})")
    d6 = m("nasa", "hi168", "C40") - m("nasa", "hi168", "C15")
    print(f"K6 nasa hi168 |C40 - C15| <= 10: {v(abs(d6) <= 10)} ({d6:+.1f})")
    a_hi = T["nasa"]["hi168"]["AT_90"]
    l05, l15 = m("nasa", "hi168", "C05") - a_hi, m("nasa", "hi168", "C15") - a_hi
    print(f"K7 C05 keeps under half of C15's hi168 lead: {v(l05 < 0.5 * l15)} ({l05:+.1f} vs {l15:+.1f})")
    b_pp = best(T["nasa"]["pp240"])
    print(f"K8 best pp240 h <= 0.15: {v(TAGS.index(b_pp[0]) <= 2)} ({b_pp[0]}, {b_pp[1]:.1f})")
    r40, r15 = m("reverse", "hi168", "C40"), m("reverse", "hi168", "C15")
    print(f"K9 reverse C40 >= C15 on hi168: {v(r40 >= r15)} ({r40:.1f} vs {r15:.1f})")
    safe = []
    for t in TAGS:
        ok = m("nasa", "all168", t) >= b_all[1] - 5 and all(
            m(w, "hi168", t) >= best(T[w]["hi168"])[1] - 5 for w in WORLDS)
        if ok:
            safe.append(t)
    gaps = {t: min([m("nasa", "all168", t) - b_all[1]] + [m(w, "hi168", t) - best(T[w]["hi168"])[1]
                                                          for w in WORLDS]) for t in TAGS}
    print(f"K10 one h within 5 of the best everywhere: {v(bool(safe))} (safe: {', '.join(safe) or 'none'}; "
          f"worst gap per h: {', '.join(f'{t} {x:+.1f}' for t, x in gaps.items())})")


if __name__ == "__main__":
    main()
