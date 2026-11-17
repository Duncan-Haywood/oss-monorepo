"""Milestone 6zzy: can the boat choose its own clamp? An adaptive half-width set from the spread of its own learned
month ratios, and fixed half-widths below 0.05, scored on all 30 points (NASA POWER) and at the nine high-amplitude
points in four irradiance worlds.

Why: 6zzx's first two "Next" items. 6zzx swept fixed half-widths 0.05 to 0.40: on all 30 points the narrowest (C05,
151.4 of 168 on the five-lag mean) was best and the first one-season rule to clear no correction's 139, while the
cross world (NASA climatology, ERA5 sun) wanted the widest (C40 62.4 against C05 22.2). No single h was within 5 of
the best in every world (smallest worst gap C10, 23.8). A deployed boat does not know which world it sails in, but it
does know its own learned ratios: in 6zzx's descriptive table 43.7% of NASA all-30 real-shape raw ratios lie outside
+-5% and 16.4% outside +-10%, against 70.4% and 46.3% in cross. So the spread of the ratios may tell the boat how wide
to clamp. And the all168 curve must turn below 0.05 (its h = 0 limit is AT_90, 139), so where it turns is open.

Design (fixed here, before any configuration below was run; the thresholds 0.10 and 0.05 were chosen from 6zzx's
published descriptive table above, not from any score):
  For each point, shape, scoring half and lag g, 6zzx's raw month ratios r_m and raw level L on the one learning
  year (`run_level_season.raw`); d = mean over the 12 months of |r_m - 1| (the ratios' spread about 1).
  Fixed rules C<h>_g: r_m clamped to [1 - h, 1 + h] for h in 0.01, 0.02, 0.03, 0.04 (new), 0.05 and 0.15 (checks).
  Adaptive rules (h chosen per learning year from its own ratios, nothing tuned on scores):
    AS_g (switch on spread): h = 0.05 if d < 0.10, else 0.30.
    AP_g (proportional):     h = min(0.40, max(0.02, d)).
    AL_g (switch on level):  h = 0.05 if |L - 1| < 0.05, else 0.30.
  Applied through AT_90's machinery exactly as 6zzx. AT_90 is no correction.
  Worlds, counts, payload, packs, shapes, halves, B, "dominates B", local summer: exactly as 6zzx (nasa at all 30
  points: all168, pp240, and hi168 / pp72 from the nine; era5, cross, reverse at the nine: hi168, pp72).
  Checks: C05 and C15 reproduce 6zzx's all168 and hi168 in every world; AT_90 all168 139, pp240 126.
  Descriptive: per world, the share of (point, shape, half, lag) learning years that each adaptive rule sends wide
  (h > 0.05 for AS and AL; mean h for AP), on all 30 points for nasa as well as the nine; failure modes of the
  all168 cells (nasa) and hi168 cells (cross, reverse) for C02, AS, AP, AL.
Predictions (priors in brackets; "mean" = mean over the five lags; "best fixed" in a world = the best five-lag mean
of 6zzx's seven half-widths and the four new ones together):
  Q1 The all168 curve turns inside (0, 0.05): some h in 0.01 ... 0.04 has an all168 mean above C05's 151.4. [55%]
  Q2 The best fixed h on all168 is 0.02 or 0.03 (an interior turn, not at 0.01 or 0.04 or 0.05). [35%]
  Q3 AS clears no correction on the 30-point pool: all168 mean >= 139. [55%]
  Q4 AS keeps most of the cross lead: cross hi168 mean >= C15's 45.2. [55%]
  Q5 AS has a smaller worst gap to the best fixed h than C10 (over nasa all168 and the four hi168 worlds). [50%]
  Q6 Some adaptive rule (AS, AP, AL) is within 5 of the best fixed h in nasa all168 and in every world's hi168. [20%]
  Q7 AS sends under 20% of nasa all-30 learning years wide, and over 40% of cross learning years. [45%]
  Q8 AP beats the setting used since 6zzj on the 30-point pool: all168 mean > C15's 121.8. [60%]
  Q9 The level is the weaker signal: AL's cross hi168 mean <= AS's. [55%]
  Q10 Some rule in this run reaches no correction per point on all 30: a pp240 mean >= 126. [25%]

Run (from research/marine-hull): PYTHONPATH=src python3 experiments/run_adaptive_clamp.py > experiments/results_adaptive_clamp.txt
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
import run_clamp_sweep as cw  # noqa: E402
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
H = (0.01, 0.02, 0.03, 0.04, 0.05, 0.15)
FIXED = tuple(f"C{round(h * 100):02d}" for h in H)
ADAPT = ("AS", "AP", "AL")
TAGS = FIXED + ADAPT
RULES = ("AT_90",) + tuple(f"{t}_{g}" for t in TAGS for g in LAGS)
WORLDS = ("nasa", "era5", "cross", "reverse")
AT_ALL, AT_PP240 = 139, 126
# 6zzx (results_clamp_sweep.txt): all168 and hi168 per lag for C05 and C15
CHECK_ALL = {"C05": (153, 148, 158, 160, 138), "C15": (97, 117, 132, 152, 111)}
CHECK_HI = {"nasa": ((45, 107, 9, 87, 52), (77, 153, 1, 124, 50)),
            "era5": ((36, 68, 26, 56, 42), (49, 100, 16, 78, 44)),
            "cross": ((0, 41, 2, 49, 19), (12, 104, 0, 68, 42)),
            "reverse": ((40, 104, 7, 76, 55), (79, 158, 2, 120, 60))}
# 6zzx's five-lag means for its seven fixed half-widths (C05 ... C40), per (world, count)
OLD = {("nasa", "all168"): (151.4, 134.4, 121.8, 117.8, 117.6, 117.6, 117.6),
       ("nasa", "hi168"): (60.0, 78.6, 81.0, 81.4, 81.4, 81.4, 81.4),
       ("era5", "hi168"): (45.6, 52.0, 57.4, 59.6, 59.8, 59.8, 59.8),
       ("cross", "hi168"): (22.2, 38.6, 45.2, 50.2, 57.2, 61.6, 62.4),
       ("reverse", "hi168"): (56.4, 74.8, 83.8, 84.6, 83.6, 83.6, 83.6)}
OLD_TAGS = ("C05", "C10", "C15", "C20", "C25", "C30", "C40")
C10_GAP = -23.8


def spread(r):
    return sum(abs(x - 1) for x in r) / len(r)


def half_width(tag, r, level):
    """The adaptive rule's half-width for one learning year's raw ratios r and level."""
    if tag == "AS":
        return 0.05 if spread(r) < 0.10 else 0.30
    if tag == "AP":
        return min(0.40, max(0.02, spread(r)))
    if tag == "AL":
        return 0.05 if abs(level - 1) < 0.05 else 0.30
    raise ValueError(tag)


def corrections(p, hn, shape):
    """{rule: 12 monthly factors} for every fixed and adaptive half-width and lag, scoring half hn."""
    out = {}
    for g in LAGS:
        r, level = lv.raw(p, su.years_of(hn, (g,)), shape)
        for h, t in zip(H, FIXED):
            out[f"{t}_{g}"] = tuple(lv.clamp(x, (1 - h, 1 + h)) for x in r)
        for t in ADAPT:
            h = half_width(t, r, level)
            out[f"{t}_{g}"] = tuple(lv.clamp(x, (1 - h, 1 + h)) for x in r)
    return out


def score(key):
    """((cap, point, year, s0, amp, phi), {rule: (km, excess dark h, tau-days)}); 6zzx's machinery."""
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


def wide(points, shapes):
    """{AS, AL: share of learning years sent wide; AP: mean h} over points, shapes, both halves, five lags."""
    n = 0
    acc = dict.fromkeys(ADAPT, 0.0)
    for p in points:
        for sh in shapes:
            for hn in ("E", "L"):
                for g in LAGS:
                    r, level = lv.raw(p, su.years_of(hn, (g,)), sh)
                    n += 1
                    for t in ADAPT:
                        h = half_width(t, r, level)
                        acc[t] += h if t == "AP" else (h > 0.05)
    return {t: x / n for t, x in acc.items()}


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
    sel = ("AT_90",) + tuple(f"{t}_{g}" for t in ("C02",) + ADAPT for g in LAGS)
    out = {"tab": {"hi168": ss.pooled(cells, hi, SHAPES), "pp72": ss.per_point(cells, hi)},
           "wide_hi": wide(hi, SHAPES), "modes_hi": modes(cells, hi, sel)}
    if world == "nasa":
        out["tab"]["all168"] = ss.pooled(cells, pts, SHAPES)
        out["tab"]["pp240"] = ss.per_point(cells, pts)
        out["wide_all"] = wide(pts, SHAPES)
        out["modes_all"] = modes(cells, pts, sel)
    return out


def mean_of(tab, t):
    xs = [tab[f"{t}_{g}"] for g in LAGS]
    return st.mean(xs), min(xs), max(xs)


def best_fixed(T, w, c):
    """(tag, mean) of the best fixed half-width over this run's four new ones and 6zzx's seven."""
    cand = [(t, mean_of(T[w][c], t)[0]) for t in FIXED[:4]] + list(zip(OLD_TAGS, OLD[(w, c)]))
    return max(cand, key=lambda x: x[1])


def worst_gap(T, t):
    return min(mean_of(T[w][c], t)[0] - best_fixed(T, w, c)[1] for w, c in OLD)


def main():
    if len(sys.argv) == 3 and sys.argv[1] == "--world":
        json.dump(run_world(sys.argv[2]), sys.stdout)
        return
    env = dict(os.environ, PYTHONPATH=os.path.join(HERE, "..", "src"))
    R = {w: json.loads(subprocess.run([sys.executable, __file__, "--world", w], env=env, check=True,
                                      capture_output=True, text=True).stdout) for w in WORLDS}
    T = {w: R[w]["tab"] for w in WORLDS}
    print("Milestone 6zzy: adaptive clamp from the learned ratios' own spread, and fixed half-widths below 0.05; "
          "2005 to 2014 scored, 2015 to 2024 climatology (50 W)")
    print(f"fixed: {', '.join(f'{t} = {h:.2f}' for t, h in zip(FIXED, H))}; adaptive: AS (0.05 if spread < 0.10 "
          "else 0.30), AP (h = spread, in [0.02, 0.40]), AL (0.05 if |level - 1| < 0.05 else 0.30)")
    print("nasa world: all 30 points (all168, pp240) and the nine high-amplitude points (hi168, pp72); era5, cross "
          "(NASA climatology, ERA5 sun), reverse (ERA5 climatology, NASA sun): nine points only")

    print("\nChecks:")
    for t, want in CHECK_ALL.items():
        got = tuple(T["nasa"]["all168"][f"{t}_{g}"] for g in LAGS)
        print(f"  nasa all168 {t} {got} (6zzx {want})" + ("  ok" if got == want else "  MISMATCH"))
    at = (T["nasa"]["all168"]["AT_90"], T["nasa"]["pp240"]["AT_90"])
    print(f"  nasa AT_90 all168 / pp240 {at} ({AT_ALL}, {AT_PP240})" + ("  ok" if at == (AT_ALL, AT_PP240) else
                                                                        "  MISMATCH"))
    for w, (c05, c15) in CHECK_HI.items():
        g05 = tuple(T[w]["hi168"][f"C05_{g}"] for g in LAGS)
        g15 = tuple(T[w]["hi168"][f"C15_{g}"] for g in LAGS)
        print(f"  {w} hi168 C05 {g05}, C15 {g15}" + ("  ok" if (g05, g15) == (c05, c15) else "  MISMATCH"))

    print("\nPer rule and lag: nasa all168 | nasa pp240 | hi168 nasa/era5/cross/reverse | pp72 nasa/era5/cross/reverse")
    for r in RULES:
        hi = "/".join(str(T[w]["hi168"][r]) for w in WORLDS)
        pp = "/".join(str(T[w]["pp72"][r]) for w in WORLDS)
        print(f"  {r:6s} | {T['nasa']['all168'][r]:4d} | {T['nasa']['pp240'][r]:4d} | {hi:>16s} | {pp:>12s}")

    print("\nFive-lag mean [min, max] by rule")
    cols = [("nasa", "all168"), ("nasa", "pp240")] + [(w, "hi168") for w in WORLDS] + [("cross", "pp72")]
    print("  rule | " + " | ".join(f"{w} {c}".rjust(17) for w, c in cols))
    print("  AT90 | " + " | ".join(f"{T[w][c]['AT_90']:17d}" for w, c in cols))
    for t in TAGS:
        print(f"  {t:4s} | " + " | ".join("{:6.1f} [{:3d},{:3d}]".format(*mean_of(T[w][c], t)).rjust(17)
                                          for w, c in cols))

    print("\nBest fixed half-width per count (this run's C01 to C04 with 6zzx's C05 to C40) and each rule's gap")
    for w, c in OLD:
        b = best_fixed(T, w, c)
        gaps = ", ".join(f"{t} {mean_of(T[w][c], t)[0] - b[1]:+.1f}" for t in TAGS)
        print(f"  {w} {c}: best {b[0]} {b[1]:.1f}; {gaps}")
    print("  worst gap over the five: " + ", ".join(f"{t} {worst_gap(T, t):+.1f}" for t in TAGS) +
          f" (6zzx's best fixed, C10, {C10_GAP:+.1f} against its own seven)")

    print("\nAdaptive choices: share of learning years sent wide (AS, AL) and mean h (AP), all 21 shapes")
    print("  " + " | ".join(["nasa all30".rjust(16)] + [w.rjust(16) for w in WORLDS]))
    rows = [R["nasa"]["wide_all"]] + [R[w]["wide_hi"] for w in WORLDS]
    print("  " + " | ".join(f"AS {x['AS']:.3f} AL {x['AL']:.3f}".rjust(16) for x in rows))
    print("  " + " | ".join(f"AP mean h {x['AP']:.3f}".rjust(16) for x in rows))

    print("\nFailing cells by mode (km only / dark only / both)")
    blocks = [("nasa all168", R["nasa"]["modes_all"])] + [(f"{w} hi168", R[w]["modes_hi"]) for w in
                                                          ("cross", "reverse")]
    for name, md in blocks:
        print(f"  {name}: AT_90 " + "/".join(map(str, md["AT_90"])))
        for t in ("C02",) + ADAPT:
            print(f"    {t}: " + "; ".join("lag {} {}/{}/{}".format(g, *md[f"{t}_{g}"]) for g in LAGS))

    v = lambda b: "held" if b else "refuted"  # noqa: E731
    m = lambda w, c, t: mean_of(T[w][c], t)[0]  # noqa: E731
    print("\nPredictions")
    low = {t: m("nasa", "all168", t) for t in FIXED[:4]}
    print(f"Q1 some h < 0.05 above C05's all168: {v(max(low.values()) > 151.4)} "
          f"({', '.join(f'{t} {x:.1f}' for t, x in low.items())}; C05 {m('nasa', 'all168', 'C05'):.1f})")
    b = best_fixed(T, "nasa", "all168")
    print(f"Q2 best fixed all168 h is 0.02 or 0.03: {v(b[0] in ('C02', 'C03'))} ({b[0]}, {b[1]:.1f})")
    print(f"Q3 AS all168 >= 139: {v(m('nasa', 'all168', 'AS') >= AT_ALL)} ({m('nasa', 'all168', 'AS'):.1f})")
    print(f"Q4 AS cross hi168 >= 45.2: {v(m('cross', 'hi168', 'AS') >= 45.2)} ({m('cross', 'hi168', 'AS'):.1f})")
    print(f"Q5 AS worst gap smaller than C10's: {v(worst_gap(T, 'AS') > C10_GAP)} "
          f"(AS {worst_gap(T, 'AS'):+.1f}, C10 {C10_GAP:+.1f})")
    ok = [t for t in ADAPT if worst_gap(T, t) >= -5]
    print(f"Q6 an adaptive rule within 5 everywhere: {v(bool(ok))} "
          f"({', '.join(f'{t} {worst_gap(T, t):+.1f}' for t in ADAPT)})")
    wa, wc = R["nasa"]["wide_all"]["AS"], R["cross"]["wide_hi"]["AS"]
    print(f"Q7 AS wide < 20% nasa all30 and > 40% cross: {v(wa < 0.20 and wc > 0.40)} ({wa:.3f}, {wc:.3f})")
    print(f"Q8 AP all168 > 121.8: {v(m('nasa', 'all168', 'AP') > 121.8)} ({m('nasa', 'all168', 'AP'):.1f})")
    print(f"Q9 AL cross hi168 <= AS's: {v(m('cross', 'hi168', 'AL') <= m('cross', 'hi168', 'AS'))} "
          f"(AL {m('cross', 'hi168', 'AL'):.1f}, AS {m('cross', 'hi168', 'AS'):.1f})")
    pp = {t: m("nasa", "pp240", t) for t in TAGS}
    bp = max(pp, key=pp.get)
    print(f"Q10 some pp240 mean >= 126: {v(pp[bp] >= AT_PP240)} (best {bp} {pp[bp]:.1f})")


if __name__ == "__main__":
    main()
