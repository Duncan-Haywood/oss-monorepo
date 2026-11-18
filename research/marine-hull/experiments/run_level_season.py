"""Milestone 6zzw: is the one-season learned correction a level correction or a seasonal one? Split the learned
monthly ratios into an annual level and a level-free seasonal shape, widen the clamp, and add the reverse product
mismatch (plan on ERA5, sail on NASA), at the nine high-amplitude points.

Why: 6zzv's first two "Next" items. When the boat planned with NASA POWER's climatology and sailed under ERA5 sunlight
("cross"), the raw learned ratios LC led no correction (AT_90) by +42 of 168 pooled cells, more than in either
self-consistent world, and a quarter of the learned month ratios sat on the upper clamp 1.15. 6zzv read that as a
level correction: a boat whose climatology is biased gains from learning its own level, whatever the season does. That
reading was not tested. If it is right, one annual ratio should keep most of LC's lead in cross, a level-free shape
should lose it, and a wider clamp should help in cross and not elsewhere. The reverse mismatch (a climatology brighter
than the sea) is the side 6zzv could not see: there the boat plans too boldly, and the failures should move from km
to dark hours.

Design (fixed here, before any configuration below was run):
  Worlds: "nasa", "era5" and "cross" exactly as 6zzv (`run_cross_source.py`); "reverse": fy._clim is computed from
  ERA5 (2015 to 2024) and frozen, then the NASA POWER series is restored for every day 2005 to 2024 at the nine
  points, so plans, B and the 21 bias shapes rest on ERA5 while the scored year's sun and the learning year's log are
  NASA. Everything else as 6zzv: payload 50 W, packs, shapes, lags 1 to 5 (one learning year each), local summer,
  B, "dominates B", counts hi168 (nine points pooled, 21 shapes x 2 halves x 4 packs), hi8 (real shape), pp72 (per
  point, real shape).
  Rules, each run through AT_90's machinery on a corrected climatology c(d) x hc(d) as 6zza (K term, target rebuilt,
  AT ratio's denominator), learning on the one year at lag g. Raw monthly ratios r_m = harvest_m / scaled clim_m on
  that year, raw level L = sum harvest / sum scaled clim.
    LC_g   r_m clamped to [0.85, 1.15], interpolated (6zzj's rule; must reproduce 6zzv's LC hi168 in nasa, era5,
           cross).
    LM_g   level only: L clamped to [0.85, 1.15], flat over the year.
    LS_g   season only: r_m / L clamped to [0.85, 1.15] (the learned shape with its level removed).
    LW_g   LC with the clamp widened to [0.70, 1.30].
    MW_g   LM with the clamp widened to [0.70, 1.30].
  AT_90 is the uncorrected rule (must reproduce 6zzv's AT_90 hi168 in nasa, era5, cross).
  Clamp statistics per world: share of real-shape month ratios at the upper and lower narrow clamp and their mean;
  share of real-shape levels L outside [0.85, 1.15].
Predictions (priors in brackets; "mean" = mean of hi168 over the five lags unless stated):
  W1 In cross, level alone keeps most of the lead: LM mean - AT_90 >= 0.5 x (LC mean - AT_90). [60%]
  W2 In cross, level alone is at least as good as monthly ratios: LM mean >= LC mean. [40%]
  W3 In cross, a shape without its level loses the lead: LS mean < 0.5 x LC mean. [65%]
  W4 In cross, the wider clamp helps: LW mean > LC mean. [60%]
  W5 In the self-consistent worlds the wider clamp changes little: |LW mean - LC mean| <= 5 in nasa and era5. [55%]
  W6 In the NASA world, where 6zzq's high-latitude case was made, the season adds to the level: LC mean > LM mean.
     [55%]
  W7 Reverse: the learned correction leads no correction: LC mean > AT_90. [65%]
  W8 Reverse: AT_90's failing hi168 cells are mostly dark (dark only + both > km only). [55%]
  W9 Reverse: the lower clamp binds often: share of real-shape month ratios at 0.85 >= 2x the ERA5 world's. [65%]
  W10 Per point the level rule holds in cross: LM mean pp72 >= AT_90 pp72. [55%]
Descriptive: every rule x lag in the four worlds; failure modes (km / dark / both) of AT_90, LC, LM, LS, LW in cross
  and reverse; per-point real-shape counts for AT_90, LC, LM in cross and reverse.

Run (from research/marine-hull): PYTHONPATH=src python3 experiments/run_level_season.py > experiments/results_level_season.txt
(stdlib, deterministic; each world in its own subprocess with up to 4 worker processes)"""
import json
import os
import statistics as st
import subprocess
import sys
from functools import lru_cache
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import run_cross_source as cs  # noqa: E402
import run_era5_rules as er  # noqa: E402
import run_fresh_years as fy  # noqa: E402
import run_learned_season as ls  # noqa: E402
import run_pack_hotel_tau as pt  # noqa: E402
import run_reserve_curve as rc  # noqa: E402
import run_season_week as sw  # noqa: E402
import run_self_bias as sb  # noqa: E402
import run_side_guard as sg  # noqa: E402
import run_subset_years as su  # noqa: E402
import run_summer_shift as ss  # noqa: E402
import run_year_pack as yp  # noqa: E402

LAGS, YEARS, REAL, SHAPES, PACKS, BASE = er.LAGS, er.YEARS, er.REAL, er.SHAPES, er.PACKS, er.BASE
HOTEL, PS, N = sg.HOTEL, sg.PS, sg.N
NARROW, WIDE = (0.85, 1.15), (0.70, 1.30)
TAGS = ("LC", "LM", "LS", "LW", "MW")
RULES = ("AT_90",) + tuple(f"{t}_{g}" for t in TAGS for g in LAGS)
WORLDS = ("nasa", "era5", "cross", "reverse")
COUNTS = ("hi168", "hi8", "pp72")
# 6zzv's hi168 (results_cross_source.txt), reproduced as checks
CHECK = {"nasa": (25, (77, 153, 1, 124, 50)), "era5": (29, (49, 100, 16, 78, 44)), "cross": (3, (12, 104, 0, 68, 42))}


def clamp(x, lim):
    return min(lim[1], max(lim[0], x))


@lru_cache(maxsize=None)
def raw(p, years, shape):
    """(12 raw monthly ratios, raw level) of logged harvest over the shape-scaled climatology on `years`."""
    hs, cs_ = [0.0] * 12, [0.0] * 12
    for yr in years:
        h = fy._sun(p, yr)[1]
        hc = ls.scaled(p, yr, shape)[1]
        for d, x, y in zip(rc.dates(yr), h, hc):
            hs[d.month - 1] += x
            cs_[d.month - 1] += y
    return tuple(x / y for x, y in zip(hs, cs_)), sum(hs) / sum(cs_)


def corrections(p, hn, shape):
    """{rule: 12 monthly factors} for every tag and lag, scoring half hn."""
    out = {}
    for g in LAGS:
        r, lev = raw(p, su.years_of(hn, (g,)), shape)
        out[f"LC_{g}"] = tuple(clamp(x, NARROW) for x in r)
        out[f"LM_{g}"] = (clamp(lev, NARROW),) * 12
        out[f"LS_{g}"] = tuple(clamp(x / lev, NARROW) for x in r)
        out[f"LW_{g}"] = tuple(clamp(x, WIDE) for x in r)
        out[f"MW_{g}"] = (clamp(lev, WIDE),) * 12
    return out


def score(key):
    """((cap, point, year, s0, amp, phi), {rule: (km, excess dark h, tau-days)}); sg.score's machinery."""
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


def restore_nasa(points):
    """Drop the swapped series at `points` so rc.series reloads NASA, re-add 2005 to 2014, clear caches."""
    for p in points:
        rc._SERIES.pop(p, None)
    fy.load()
    er.clear_caches()


def use_reverse(points):
    """ERA5 climatology frozen, then NASA sun at `points` (2005 to 2024)."""
    er.use_era5(points)
    frozen = cs.freeze_clim(points)
    restore_nasa(points)
    return frozen


def clamp_stats(points):
    """(share at 1.15, share at 0.85, mean month ratio, share of levels outside the narrow clamp), real shape."""
    xs, levs = [], []
    for p in points:
        for hn in ("E", "L"):
            for g in LAGS:
                r, lev = raw(p, su.years_of(hn, (g,)), REAL)
                xs += [clamp(x, NARROW) for x in r]
                levs.append(lev)
    return (sum(x >= NARROW[1] for x in xs) / len(xs), sum(x <= NARROW[0] for x in xs) / len(xs), st.mean(xs),
            sum(not NARROW[0] < v < NARROW[1] for v in levs) / len(levs))


def check_swap(world, pts, frozen):
    p, yr = pts[0], YEARS[0]
    if fy._clim(p, yr) is not frozen[(p, yr)]:
        raise RuntimeError("frozen climatology did not reach fy._clim")
    if world == "reverse":
        want = rc.series(p)  # reloaded NASA
        if "20050101" not in want:
            raise RuntimeError("NASA 2005 to 2014 not restored")
        era5 = er.era5_series(json.load(open(er.ERA5_FILE))[p])
        got = sum(fy._sun(p, yr)[0])
        if abs(got - sum(want[d.strftime("%Y%m%d")] for d in rc.dates(yr))) > 1e-9 or \
                abs(got - sum(era5[d.strftime("%Y%m%d")] for d in rc.dates(yr))) < 1e-6:
            raise RuntimeError("reverse world does not sail on NASA")


def run_world(world):
    pts = ls.high_amp_points()
    if world == "era5":
        er.use_era5(pts)
    elif world == "cross":
        check_swap(world, pts, cs.use_cross(pts))
    elif world == "reverse":
        check_swap(world, pts, use_reverse(pts))
    elif world != "nasa":
        raise ValueError(world)
    fy.prepare()
    keys = [(c, p, yr) + sh for p in pts for yr in YEARS for c in PACKS for sh in SHAPES]
    with Pool(4) as pool:
        cells = dict(pool.map(score, keys, chunksize=8))
    ss.RULES = RULES
    tab = {"hi168": ss.pooled(cells, pts, SHAPES), "hi8": ss.pooled(cells, pts, (REAL,)),
           "pp72": ss.per_point(cells, pts)}
    modes = {r: ss.failure_modes(cells, pts, r) for r in RULES}
    pp = {p: ss.per_point(cells, (p,)) for p in pts}
    return {"tab": tab, "modes": modes, "pp": pp, "clamp": clamp_stats(pts)}


def mean_of(tab, t):
    xs = [tab[f"{t}_{g}"] for g in LAGS]
    return st.mean(xs), min(xs), max(xs)


def main():
    if len(sys.argv) == 3 and sys.argv[1] == "--world":
        json.dump(run_world(sys.argv[2]), sys.stdout)
        return
    env = dict(os.environ, PYTHONPATH=os.path.join(HERE, "..", "src"))
    R = {w: json.loads(subprocess.run([sys.executable, __file__, "--world", w], env=env, check=True,
                                      capture_output=True, text=True).stdout) for w in WORLDS}
    T = {w: R[w]["tab"] for w in WORLDS}
    pts = ls.high_amp_points()
    print("Milestone 6zzw: level against season in the one-season learned correction, at the nine high-amplitude "
          "points; 2005 to 2014 scored, 2015 to 2024 climatology (50 W)")
    print(f"points: {', '.join(pts)}")
    print("worlds: nasa, era5 (self-consistent), cross (NASA climatology, ERA5 sun), reverse (ERA5 climatology, "
          "NASA sun)")
    print(f"rules: LC monthly {NARROW}, LM level {NARROW}, LS level-free shape {NARROW}, LW monthly {WIDE}, "
          f"MW level {WIDE}")

    print("\nChecks (6zzv hi168: AT_90; LC lags 1-5):")
    for w, (at, lc) in CHECK.items():
        got = (T[w]["hi168"]["AT_90"], tuple(T[w]["hi168"][f"LC_{g}"] for g in LAGS))
        print(f"  {w}: AT_90 {got[0]}; LC {got[1]}" + ("  ok" if got == (at, lc) else "  MISMATCH"))

    print("\nPer rule and lag: dominance counts, " + " / ".join(WORLDS))
    print("  rule   | " + " | ".join(f"{c:>16s}" for c in COUNTS))
    for r in RULES:
        print(f"  {r:6s} | " + " | ".join("/".join(f"{T[w][c][r]:d}" for w in WORLDS).rjust(16) for c in COUNTS))

    print("\nPer rule over the five lags: mean [min, max], " + " | ".join(WORLDS))
    for c in COUNTS:
        print(f"  {c}: AT_90 " + " | ".join(str(T[w][c]["AT_90"]) for w in WORLDS))
        for t in TAGS:
            print(f"    {t}: " + " | ".join("{:6.1f} [{:3d},{:3d}]".format(*mean_of(T[w][c], t)) for w in WORLDS))

    print("\nReal-shape learned ratios (nine points, both halves, five lags): month at 1.15 / at 0.85 / mean / "
          "level outside [0.85, 1.15]")
    for w in WORLDS:
        print("  {}: {:.3f} / {:.3f} / {:.3f} / {:.3f}".format(w, *R[w]["clamp"]))

    for w in ("cross", "reverse"):
        print(f"\nFailing {w} hi168 cells by mode (km only / dark only / both)")
        print("  AT_90: {}/{}/{}".format(*R[w]["modes"]["AT_90"]))
        for t in ("LC", "LM", "LS", "LW"):
            print(f"  {t}: " + "; ".join("lag {} {}/{}/{}".format(g, *R[w]["modes"][f"{t}_{g}"]) for g in LAGS))

    print("\nPer point, real shape (of 8 cells): AT_90 | LC lags 1-5 | LM lags 1-5, cross -> reverse")
    for p in pts:
        row = lambda d: f"{d['AT_90']} | " + " ".join(str(d[f'LC_{g}']) for g in LAGS) + " | " + " ".join(  # noqa: E731
            str(d[f'LM_{g}']) for g in LAGS)
        print(f"  {p:15s} {row(R['cross']['pp'][p])}  ->  {row(R['reverse']['pp'][p])}")

    m = lambda w, t, c="hi168": mean_of(T[w][c], t)[0]  # noqa: E731
    at = lambda w, c="hi168": T[w][c]["AT_90"]  # noqa: E731
    v = lambda b: "held" if b else "refuted"  # noqa: E731
    print("\nPredictions (hi168 means over the five lags unless stated)")
    lc_lead, lm_lead = m("cross", "LC") - at("cross"), m("cross", "LM") - at("cross")
    print(f"W1 cross LM lead >= half LC lead: {v(lm_lead >= 0.5 * lc_lead)} ({lm_lead:+.1f} vs {lc_lead:+.1f})")
    print(f"W2 cross LM >= LC: {v(m('cross', 'LM') >= m('cross', 'LC'))} "
          f"({m('cross', 'LM'):.1f} vs {m('cross', 'LC'):.1f})")
    print(f"W3 cross LS < half LC: {v(m('cross', 'LS') < 0.5 * m('cross', 'LC'))} "
          f"({m('cross', 'LS'):.1f} vs {m('cross', 'LC'):.1f})")
    print(f"W4 cross LW > LC: {v(m('cross', 'LW') > m('cross', 'LC'))} "
          f"({m('cross', 'LW'):.1f} vs {m('cross', 'LC'):.1f})")
    d5 = {w: m(w, "LW") - m(w, "LC") for w in ("nasa", "era5")}
    print(f"W5 |LW - LC| <= 5 in nasa and era5: {v(all(abs(x) <= 5 for x in d5.values()))} "
          f"(nasa {d5['nasa']:+.1f}, era5 {d5['era5']:+.1f})")
    print(f"W6 nasa LC > LM: {v(m('nasa', 'LC') > m('nasa', 'LM'))} ({m('nasa', 'LC'):.1f} vs {m('nasa', 'LM'):.1f})")
    print(f"W7 reverse LC > AT_90: {v(m('reverse', 'LC') > at('reverse'))} "
          f"({m('reverse', 'LC'):.1f} vs {at('reverse')})")
    km, dk, both = R["reverse"]["modes"]["AT_90"]
    print(f"W8 reverse AT_90 failures mostly dark: {v(dk + both > km)} (km {km}, dark {dk}, both {both})")
    lo_r, lo_e = R["reverse"]["clamp"][1], R["era5"]["clamp"][1]
    print(f"W9 reverse share at 0.85 >= 2x era5's: {v(lo_r >= 2 * lo_e)} ({lo_r:.3f} vs {lo_e:.3f})")
    print(f"W10 cross LM mean pp72 >= AT_90 pp72: {v(m('cross', 'LM', 'pp72') >= at('cross', 'pp72'))} "
          f"({m('cross', 'LM', 'pp72'):.1f} vs {at('cross', 'pp72')})")


if __name__ == "__main__":
    main()
