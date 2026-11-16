"""Milestone 6zzv: what happens to the single-season rules when the boat plans with one irradiance product and sails
under another? NASA POWER climatology for the plan, ERA5 sunlight for the sea the boat logs and is scored on, at the
nine high-amplitude points.

Why: 6zzu's first "Next". 6zzu replaced NASA with ERA5 everywhere (climatology, learning year and scored year), a
self-consistent second world, and found every ordering survived while each learned rule's lead over no correction
shrank by a third to a half. A deployed boat is not in either world: its climatology comes from a product (here NASA
POWER, the source every milestone before 6zzu planned with) and its panels see the real sun, which no product
reproduces. ERA5's level is 2% to 22% above NASA's at these points (6zzm), so the cross case adds a source-level error
on top of the year-to-year error the rules were built for. A learned month ratio (logged harvest over the planned
climatology) absorbs a level error by construction, up to the clamp [0.85, 1.15]; no correction (AT_90) sees it only
through its 90-day running ratio. The question is whether that turns the learned correction from "a high-latitude
tool of source-dependent size" into a clearer win, or whether the clamp and the rules' summer guards get in the way.

Design (fixed here, before any configuration below was run in the cross world):
  Worlds: "nasa" and "era5" are 6zzu's self-consistent worlds, rerun by 6zzu's code as checks (they must reproduce
  6zzu's hi168 for every rule and lag). "cross": fy._clim (the 2015 to 2024 smoothed climatology every plan, B
  included, is built from, and the base the 21 bias shapes scale) is computed from NASA POWER and frozen; then ERA5
  replaces NASA for every day 2005 to 2024 at the nine points (6zzu's `use_era5`), so the scored year's sun and the
  learning year's logged harvest are ERA5. Everything else exactly as 6zzu: payload, packs, shapes, clamp,
  interpolation, AT_90, B, "dominates B", lags 1 to 5, local summer, replay side, rules LC, DG, BG, OG, OM, OA, OL.
  Counts hi168, hi8, pp72 as 6zzu. Comparisons are of dominance counts inside a world (absolute km differ by world).
  Clamp: share of learned monthly ratios (real shape, nine points, both halves, five lags) at 1.15 and at 0.85, and
  their mean, per world.
Predictions (priors in brackets; "mean" = mean over the five lags of cross hi168 unless stated):
  X1 The learned correction leads no correction in the cross world: LC mean > AT_90. [70%]
  X2 Learning a level error is worth more than the source change costs: LC's lead over AT_90 is larger in cross
     than in the ERA5 world (+28.4). [55%]
  X3 The dark guard still beats the raw ratios: DG mean > LC mean. [50%]
  X4 The clamp binds often: the share of learned real-shape month ratios at 1.15 is at least three times the ERA5
     world's. [70%]
  X5 The lags rank alike: Spearman rho between ERA5-world and cross LC_g over the five lags >= 0.7. [50%]
  X6 Planning darker than the sea makes "short" rarer: replay short share in cross < ERA5 world's (0.304). [60%]
  X7 Per point it holds: LC mean pp72 > AT_90 pp72 in cross. [55%]
  X8 The fallback keeps what it kept: OA mean within 10 of OG mean. [55%]
Descriptive: every rule x lag in the three worlds; failure modes on cross hi168; per-point real-shape counts.

Run (from research/marine-hull): PYTHONPATH=src python3 experiments/run_cross_source.py > experiments/results_cross_source.txt
(stdlib, deterministic; each world in its own subprocess with up to 4 worker processes, about 15 minutes in all)"""
import json
import os
import statistics as st
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import run_era5_rules as er  # noqa: E402
import run_fresh_years as fy  # noqa: E402
import run_learn_years as ly  # noqa: E402
import run_learned_season as ls  # noqa: E402
import run_reserve_curve as rc  # noqa: E402
import run_side_guard as sg  # noqa: E402
import run_subset_years as su  # noqa: E402

LAGS, YEARS, REAL, TAGS, RULES, COUNTS = er.LAGS, er.YEARS, er.REAL, er.TAGS, er.RULES, er.COUNTS
WORLDS = ("nasa", "era5", "cross")
# 6zzu's hi168 in its two worlds (results_era5_rules.txt), reproduced as checks
CHECK = {"nasa": {"AT_90": 25, "LC": (77, 153, 1, 124, 50), "DG": (105, 152, 74, 124, 91)},
         "era5": {"AT_90": 29, "LC": (49, 100, 16, 78, 44), "DG": (75, 97, 50, 110, 46)}}
_ORIG_CLIM = fy._clim


def freeze_clim(points):
    """Compute fy._clim from the series loaded now at `points` and pin it; other points fall through."""
    fy.load()
    frozen = {(p, yr): _ORIG_CLIM(p, yr) for p in points for yr in YEARS}

    def clim(p, yr):
        if (p, yr) in frozen:
            return frozen[(p, yr)]
        return _ORIG_CLIM(p, yr)
    fy._clim = clim
    return frozen


def use_cross(points):
    """NASA climatology frozen, then ERA5 sun at `points` (2005 to 2024)."""
    frozen = freeze_clim(points)
    er.use_era5(points)  # swaps rc._SERIES and clears every lru cache (the frozen dict is not one)
    return frozen


def clamp_stats(points):
    """(share at upper clamp, share at lower clamp, mean) of learned real-shape month ratios over lags and halves."""
    xs = [c for p in points for hn in ("E", "L") for g in LAGS
          for c in ly.learned(p, su.years_of(hn, (g,)), REAL)[0]]
    hi, lo = ly.CLAMP[1], ly.CLAMP[0]
    return sum(x >= hi for x in xs) / len(xs), sum(x <= lo for x in xs) / len(xs), st.mean(xs)


def run_world(world):
    pts = er.ls.high_amp_points()
    if world == "era5":
        er.use_era5(pts)
    elif world == "cross":
        frozen = use_cross(pts)
        p, yr = pts[0], YEARS[0]
        if fy._clim(p, yr) is not frozen[(p, yr)]:
            raise RuntimeError("frozen NASA climatology did not reach fy._clim")
        want = er.era5_series(json.load(open(er.ERA5_FILE))[p])
        if abs(sum(fy._sun(p, yr)[0]) - sum(want[d.strftime("%Y%m%d")] for d in rc.dates(yr))) > 1e-9:
            raise RuntimeError("ERA5 swap did not reach the sun series")
    elif world != "nasa":
        raise ValueError(world)
    cells, sides = er.evaluate(pts)
    out = er.tables(cells, sides, pts)
    out["clamp"] = clamp_stats(pts)
    return out


def main():
    if len(sys.argv) == 3 and sys.argv[1] == "--world":
        json.dump(run_world(sys.argv[2]), sys.stdout)
        return
    env = dict(os.environ, PYTHONPATH=os.path.join(HERE, "..", "src"))
    R = {w: json.loads(subprocess.run([sys.executable, __file__, "--world", w], env=env, check=True,
                                      capture_output=True, text=True).stdout) for w in WORLDS}
    T = {w: R[w]["tab"] for w in WORLDS}
    pts = ls.high_amp_points()
    print("Milestone 6zzv: plan on NASA POWER, sail on ERA5, at the nine high-amplitude points; single-season rules "
          "of 6zzj to 6zzt, 2005 to 2014 scored, 2015 to 2024 climatology (50 W)")
    print(f"points: {', '.join(pts)}")
    print("worlds: nasa (NASA everywhere), era5 (ERA5 everywhere), cross (NASA climatology, ERA5 sun and log)")

    print("\nChecks (6zzu hi168):")
    for w, c in CHECK.items():
        got = {"AT_90": T[w]["hi168"]["AT_90"], "LC": tuple(T[w]["hi168"][f"LC_{g}"] for g in LAGS),
               "DG": tuple(T[w]["hi168"][f"DG_{g}"] for g in LAGS)}
        print(f"  {w}: " + "; ".join(f"{k} {got[k]}" for k in c) + ("  ok" if got == {k: (v if isinstance(v, int)
                                                                                         else tuple(v))
                                                                                     for k, v in c.items())
                                                                     else "  MISMATCH"))

    print("\nPer rule and lag: dominance counts, nasa / era5 / cross")
    print("  rule   | " + " | ".join(f"{c:>14s}" for c in COUNTS))
    for r in RULES:
        print(f"  {r:6s} | " + " | ".join("/".join(f"{T[w][c][r]:d}" for w in WORLDS).rjust(14) for c in COUNTS))

    print("\nPer rule over the five lags: mean [min, max], nasa | era5 | cross")
    for c in COUNTS:
        print(f"  {c}: AT_90 " + " | ".join(str(T[w][c]["AT_90"]) for w in WORLDS))
        for t in TAGS:
            print(f"    {t}: " + " | ".join("{:6.1f} [{:3d},{:3d}]".format(*er.mean_of(T[w][c], t)) for w in WORLDS))

    print("\nLearned real-shape month ratios (nine points, both halves, five lags): at 1.15 / at 0.85 / mean")
    for w in WORLDS:
        print("  {}: {:.3f} / {:.3f} / {:.3f}".format(w, *R[w]["clamp"]))

    print("\nFailing cross hi168 cells by mode (km only / dark only / both)")
    for t in ("LC", "DG", "OG", "OA"):
        print(f"  {t}: " + "; ".join("lag {} {}/{}/{}".format(g, *R["cross"]["modes"][f"{t}_{g}"]) for g in LAGS))
    print("  AT_90: {}/{}/{}".format(*R["cross"]["modes"]["AT_90"]))

    print("\nReplay side shares, 21 shapes (short / dark / ok)")
    for w in WORLDS:
        sh = R[w]["share"]
        print(f"  {w}: {sh['short']:.3f} / {sh['dark']:.3f} / {sh['ok']:.3f}")

    print("\nPer point, real shape (of 8 cells): AT_90 | LC lags 1-5 | DG lags 1-5, era5 -> cross")
    for p in pts:
        e, x = R["era5"]["pp"][p], R["cross"]["pp"][p]
        row = lambda d: f"{d['AT_90']} | " + " ".join(str(d[f'LC_{g}']) for g in LAGS) + " | " + " ".join(  # noqa: E731
            str(d[f'DG_{g}']) for g in LAGS)
        print(f"  {p:15s} {row(e)}  ->  {row(x)}")

    X, E = T["cross"], T["era5"]
    m = lambda tab, t, c="hi168": er.mean_of(tab[c], t)[0]  # noqa: E731
    v = lambda b: "held" if b else "refuted"  # noqa: E731
    lead_x, lead_e = m(X, "LC") - X["hi168"]["AT_90"], m(E, "LC") - E["hi168"]["AT_90"]
    rho = er.spearman([E["hi168"][f"LC_{g}"] for g in LAGS], [X["hi168"][f"LC_{g}"] for g in LAGS])
    cx, ce = R["cross"]["clamp"][0], R["era5"]["clamp"][0]
    print("\nPredictions (cross hi168 unless stated)")
    print(f"X1 LC mean > AT_90: {v(m(X, 'LC') > X['hi168']['AT_90'])} ({m(X, 'LC'):.1f} vs {X['hi168']['AT_90']})")
    print(f"X2 LC lead over AT_90 larger in cross than era5: {v(lead_x > lead_e)} ({lead_x:+.1f} vs {lead_e:+.1f})")
    print(f"X3 DG mean > LC mean: {v(m(X, 'DG') > m(X, 'LC'))} ({m(X, 'DG'):.1f} vs {m(X, 'LC'):.1f})")
    print(f"X4 share at 1.15 >= 3x era5's: {v(cx >= 3 * ce)} ({cx:.3f} vs {ce:.3f})")
    print(f"X5 Spearman(era5 LC_g, cross LC_g) >= 0.7: {v(rho >= 0.7)} ({rho:.2f})")
    sx, se = R["cross"]["share"]["short"], R["era5"]["share"]["short"]
    print(f"X6 short share cross < era5: {v(sx < se)} ({sx:.3f} vs {se:.3f})")
    print(f"X7 LC mean pp72 > AT_90 pp72: {v(m(X, 'LC', 'pp72') > X['pp72']['AT_90'])} "
          f"({m(X, 'LC', 'pp72'):.1f} vs {X['pp72']['AT_90']})")
    print(f"X8 |OA - OG| <= 10: {v(abs(m(X, 'OA') - m(X, 'OG')) <= 10)} ({m(X, 'OA'):.1f} vs {m(X, 'OG'):.1f})")


if __name__ == "__main__":
    main()
