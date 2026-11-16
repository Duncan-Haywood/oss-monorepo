"""Milestone 6zzu: does the high-latitude case for a learned seasonal correction survive a second irradiance source?
The single-season rules of 6zzj to 6zzt, rescored at the nine high-amplitude points with ERA5 sunlight in place of
NASA POWER for every year the boat plans with, learns from and is scored on.

Why: 6zzs's and 6zzt's "Next" (open since 6zzq). Every count of the seasonal-correction line comes from one satellite
product, NASA POWER ALLSKY_SFC_SW_DWN. The paper's design-table reading is that one season of log is "a high-latitude
tool": at the nine high-amplitude points the raw learned ratios LC beat no correction (AT_90) on the pooled count
(five-lag mean 81.0 against 25 of 168) and the dark guard DG does better still (109.2), while lag 3 collapses
(LC_3 1 of 168). 6zzm found NASA and ERA5 month anomalies of the lag-3 learning years correlate r = +0.71, and their
lag-3 errors r = +0.77, but never ran a boat on ERA5. If the lead is a property of the climate, it should survive a
reanalysis with a different radiation model; if it is a property of NASA POWER's retrieval, it may not.

Design (fixed here, before any configuration below was run on ERA5):
  Data: ERA5 daily shortwave_radiation_sum 2005 to 2024 at the nine points (experiments/data/era5_sun_hiamp_2005_2024.json,
  6zzm's fetch; Hersbach et al. 2020, via Open-Meteo, CC BY 4.0), converted MJ/m2 -> kWh/m2 (/ 3.6). For source
  "era5" it replaces the NASA series at those points for all of 2005 to 2024, so the 2015 to 2024 climatology the
  plan uses, the learning year and the scored year all come from ERA5 (a self-consistent world; ERA5's level is 2% to
  22% above NASA's at these points, 6zzm, so absolute km differ and only the dominance counts are compared).
  Everything else exactly as 6zzs and 6zzt (`run_side_guard.py`, `run_replay_fallback.py`): payload, packs, the 21
  bias shapes, clamp, interpolation, AT_90, B, "dominates B", the five single-year lags, local summer, replay side.
  Counts at the nine points: hi168 (21 shapes x 2 halves x 4 packs, pooled over the nine points), hi8 (real shape
  only, pooled) and pp72 (real shape, per point, 9 x 2 x 4).
  Rules per lag g: LC_g, DG_g, BG_g, OG_g, OM_g (6zzs), OA_g, OL_g (6zzt); AT_90. The CS rules are left out (they
  need extra simulations and 6zzt read their limit as no correction).
  Source "nasa" is run by the same code as a check: it must reproduce 6zzs/6zzt's hi168 (LC 77/153/1/124/50,
  DG 105/152/74/124/91, AT_90 25; OG mean 85.8, OA mean 85.0).
  The ERA5 file was opened before (6zzm compared its monthly anomalies with NASA's); no harvest, plan or count has been
  computed on it before this run.
  Implementation fix after the first launch: the swap ran after `ls.high_amp_points()` had filled fy._sun's cache
  with NASA values, so the "ERA5" column printed NASA's counts again, cell for cell; no ERA5 number was produced.
  use_era5 now clears every cache and run_source checks the swapped series reached fy._sun. Design and predictions
  unchanged.
Predictions (priors in brackets; "mean" = mean over the five lags, on ERA5 hi168 unless stated):
  E1 The learned correction keeps its high-latitude lead: LC mean > AT_90. [70%]
  E2 The dark guard still beats the raw ratios: DG mean > LC mean. [60%]
  E3 The lag-3 collapse is a NASA artefact: LC_3 >= 30. [35%]
  E4 DG keeps a floor: DG's worst lag >= 30. [55%]
  E5 The replay gate sits between: LC mean <= OG mean <= DG mean. [65%]
  E6 Falling back gives up at most a little: OA mean within 10 of OG mean. [60%]
  E7 The lags rank alike: Spearman rho between NASA and ERA5 LC_g counts over the five lags >= 0.7. [50%]
  E8 Small source effect: every rule's (LC, DG, OG, OA) ERA5 mean within 25 of its NASA mean. [45%]
  E9 Per point it holds too: LC mean pp72 > AT_90 pp72 on ERA5. [55%]
Descriptive: every rule x lag on the three counts under both sources; failure modes (km only / dark only / both) of LC
  and DG on ERA5; replay side shares under both sources; per-point pp counts for LC and DG.

Run (from research/marine-hull): PYTHONPATH=src python3 experiments/run_era5_rules.py > experiments/results_era5_rules.txt
(stdlib, deterministic; each source runs in its own subprocess with up to 4 worker processes, a few minutes in all)"""
import json
import os
import statistics as st
import subprocess
import sys
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import run_fresh_years as fy  # noqa: E402
import run_learned_season as ls  # noqa: E402
import run_reserve_curve as rc  # noqa: E402
import run_side_guard as sg  # noqa: E402
import run_summer_shift as ss  # noqa: E402

ERA5_FILE = os.path.join(HERE, "data", "era5_sun_hiamp_2005_2024.json")
MJ_PER_KWH = 3.6
BASE, PACKS, YEARS, REAL, SHAPES, LAGS = fy.BASE, fy.PACKS, fy.YEARS, ls.REAL, ls.SHAPES, sg.LAGS
FALLBACK = ("OA", "OL")
TAGS = sg.TAGS + FALLBACK  # LC, DG, BG, OG, OM, OA, OL
RULES = ("AT_90",) + tuple(f"{t}_{g}" for t in TAGS for g in LAGS)
CHECK_HI = sg.CHECK_HI
CHECK_MEAN = {"OG": 85.8, "OA": 85.0}
COUNTS = ("hi168", "hi8", "pp72")


def era5_series(record):
    """{YYYYMMDD: kWh/m2/day} from one point's ERA5 record (MJ/m2/day from record['start'])."""
    import datetime
    d0 = datetime.date.fromisoformat(record["start"])
    return {(d0 + datetime.timedelta(days=i)).strftime("%Y%m%d"): v / MJ_PER_KWH
            for i, v in enumerate(record["values"])}


def use_era5(points):
    """Replace rc's NASA series at `points` with ERA5 for every day 2005 to 2024 (before anything is cached)."""
    data = json.load(open(ERA5_FILE))
    for p in points:
        s = era5_series(data[p])
        if "20050101" not in s or "20241231" not in s:
            raise ValueError(f"ERA5 series at {p} does not cover 2005 to 2024")
        rc._SERIES[p] = s
    clear_caches()


def clear_caches():
    """Clear every functools cache in the loaded experiment modules: `ls.high_amp_points()` (and anything else run
    before the swap) fills fy._sun / fy._clim and the learned-ratio caches with NASA values, which would otherwise
    survive the swap (the first launch of this script did exactly that and printed NASA's counts twice)."""
    for mod in list(sys.modules.values()):
        f = getattr(mod, "__file__", None) or ""
        if not f.startswith(HERE):
            continue
        for obj in vars(mod).values():
            if callable(getattr(obj, "cache_clear", None)):
                obj.cache_clear()


def fallback(cells, sides):
    """Add 6zzt's OA_g (DG where the replay is short, no correction otherwise) and OL_g (LC where short)."""
    for key, t in cells.items():
        for g in LAGS:
            short = sides[key][g] == "short"
            t[f"OA_{g}"] = t[f"DG_{g}"] if short else t["AT_90"]
            t[f"OL_{g}"] = t[f"LC_{g}"] if short else t["AT_90"]


def evaluate(points, procs=4):
    fy.prepare()
    keys = [(c, p, yr) + sh for p in points for yr in YEARS for c in PACKS for sh in SHAPES]
    with Pool(procs) as pool:
        cells = dict(pool.map(sg.score, keys, chunksize=8))
    sides = sg.gate(cells)
    fallback(cells, sides)
    return cells, sides


def tables(cells, sides, points):
    ss.RULES = RULES  # ss's counting helpers read the rule list from their module
    tab = {"hi168": ss.pooled(cells, points, SHAPES), "hi8": ss.pooled(cells, points, (REAL,)),
           "pp72": ss.per_point(cells, points)}
    modes = {r: ss.failure_modes(cells, points, r) for r in RULES}
    share = sg.side_share(sides, points, SHAPES)[0]
    pp = {p: {r: ss.per_point(cells, (p,))[r] for r in ("AT_90",) + tuple(f"{t}_{g}" for t in ("LC", "DG")
                                                                            for g in LAGS)} for p in points}
    return {"tab": tab, "modes": modes, "share": share, "pp": pp}


def run_source(source):
    pts = ls.high_amp_points()
    if source == "era5":
        use_era5(pts)
        sun = fy._sun(pts[0], YEARS[0])[0]
        want = era5_series(json.load(open(ERA5_FILE))[pts[0]])
        if abs(sum(sun) - sum(want[d.strftime("%Y%m%d")] for d in rc.dates(YEARS[0]))) > 1e-9:
            raise RuntimeError("ERA5 swap did not reach the cached sun series")
    elif source != "nasa":
        raise ValueError(source)
    cells, sides = evaluate(pts)
    return tables(cells, sides, pts)


def mean_of(tab, t):
    xs = [tab[f"{t}_{g}"] for g in LAGS]
    return st.mean(xs), min(xs), max(xs)


def ranks(xs):
    order = sorted(range(len(xs)), key=lambda i: xs[i])
    r = [0.0] * len(xs)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and xs[order[j + 1]] == xs[order[i]]:
            j += 1
        for k in range(i, j + 1):
            r[order[k]] = (i + j) / 2.0 + 1.0
        i = j + 1
    return r


def spearman(x, y):
    rx, ry = ranks(x), ranks(y)
    mx, my = st.mean(rx), st.mean(ry)
    num = sum((a - mx) * (b - my) for a, b in zip(rx, ry))
    den = (sum((a - mx) ** 2 for a in rx) * sum((b - my) ** 2 for b in ry)) ** 0.5
    return num / den if den else float("nan")


def main():
    if len(sys.argv) == 3 and sys.argv[1] == "--source":
        json.dump(run_source(sys.argv[2]), sys.stdout)
        return
    env = dict(os.environ, PYTHONPATH=os.path.join(HERE, "..", "src"))
    R = {s: json.loads(subprocess.run([sys.executable, __file__, "--source", s], env=env, check=True,
                                      capture_output=True, text=True).stdout) for s in ("nasa", "era5")}
    N, E = R["nasa"]["tab"], R["era5"]["tab"]
    pts = ls.high_amp_points()
    print("Milestone 6zzu: the single-season rules of 6zzj to 6zzt at the nine high-amplitude points, NASA POWER "
          "against ERA5 sunlight, 2005 to 2014 scored, 2015 to 2024 climatology (50 W)")
    print(f"points: {', '.join(pts)}; ERA5 replaces NASA at these points for every day 2005 to 2024")
    ok = (all(N["hi168"][g] == v for g, v in CHECK_HI.items()) and N["hi168"]["AT_90"] == sg.CHECK_AT["hi168"]
          and all(abs(mean_of(N["hi168"], t)[0] - v) < 0.05 for t, v in CHECK_MEAN.items()))
    print("\nChecks (NASA, 6zzs/6zzt hi168): " + ", ".join(f"{g} {N['hi168'][g]} ({v})" for g, v in CHECK_HI.items())
          + f"; AT_90 {N['hi168']['AT_90']} (25); " + ", ".join(
              f"{t} mean {mean_of(N['hi168'], t)[0]:.1f} ({v})" for t, v in CHECK_MEAN.items())
          + ("  ok" if ok else "  MISMATCH"))

    print("\nPer rule and lag: dominance counts, NASA / ERA5")
    print("  rule   | " + " | ".join(f"{c:>9s}" for c in COUNTS))
    for r in RULES:
        print(f"  {r:6s} | " + " | ".join(f"{N[c][r]:4d}/{E[c][r]:<4d}" for c in COUNTS))

    print("\nPer rule over the five lags: mean [min, max], NASA -> ERA5")
    for c in COUNTS:
        print(f"  {c}: AT_90 {N[c]['AT_90']} -> {E[c]['AT_90']}")
        for t in TAGS:
            a, b = mean_of(N[c], t), mean_of(E[c], t)
            print(f"    {t}: {a[0]:6.1f} [{a[1]:3d},{a[2]:3d}] -> {b[0]:6.1f} [{b[1]:3d},{b[2]:3d}]")

    print("\nFailing hi168 cells by mode on ERA5 (km only / dark only / both)")
    for t in ("LC", "DG", "OG", "OA"):
        print(f"  {t}: " + "; ".join("lag {} {}/{}/{}".format(g, *R["era5"]["modes"][f"{t}_{g}"]) for g in LAGS))
    print("  AT_90: {}/{}/{}".format(*R["era5"]["modes"]["AT_90"]))

    print("\nReplay side shares at the nine points, 21 shapes (short / dark / ok)")
    for s in ("nasa", "era5"):
        sh = R[s]["share"]
        print(f"  {s}: {sh['short']:.3f} / {sh['dark']:.3f} / {sh['ok']:.3f}")

    print("\nPer point, real shape (of 8 cells): AT_90, LC lags 1-5, DG lags 1-5, NASA -> ERA5")
    for p in pts:
        n, e = R["nasa"]["pp"][p], R["era5"]["pp"][p]
        row = lambda d: f"{d['AT_90']} | " + " ".join(str(d[f'LC_{g}']) for g in LAGS) + " | " + " ".join(  # noqa: E731
            str(d[f'DG_{g}']) for g in LAGS)
        print(f"  {p:15s} {row(n)}  ->  {row(e)}")

    m = lambda t, c="hi168": mean_of(E[c], t)[0]  # noqa: E731
    mn = lambda t, c="hi168": mean_of(N[c], t)[0]  # noqa: E731
    v = lambda b: "held" if b else "refuted"  # noqa: E731
    hi = E["hi168"]
    rho = spearman([N["hi168"][f"LC_{g}"] for g in LAGS], [hi[f"LC_{g}"] for g in LAGS])
    diffs = {t: m(t) - mn(t) for t in ("LC", "DG", "OG", "OA")}
    print("\nPredictions (ERA5 hi168 unless stated)")
    print(f"E1 LC mean > AT_90: {v(m('LC') > hi['AT_90'])} ({m('LC'):.1f} vs {hi['AT_90']})")
    print(f"E2 DG mean > LC mean: {v(m('DG') > m('LC'))} ({m('DG'):.1f} vs {m('LC'):.1f})")
    print(f"E3 LC_3 >= 30: {v(hi['LC_3'] >= 30)} ({hi['LC_3']})")
    print(f"E4 DG worst lag >= 30: {v(mean_of(hi, 'DG')[1] >= 30)} ({mean_of(hi, 'DG')[1]})")
    print(f"E5 LC <= OG <= DG (means): {v(m('LC') <= m('OG') <= m('DG'))} "
          f"({m('LC'):.1f}, {m('OG'):.1f}, {m('DG'):.1f})")
    print(f"E6 |OA - OG| <= 10: {v(abs(m('OA') - m('OG')) <= 10)} ({m('OA'):.1f} vs {m('OG'):.1f})")
    print(f"E7 Spearman(NASA LC_g, ERA5 LC_g) >= 0.7: {v(rho >= 0.7)} ({rho:.2f})")
    print(f"E8 every |ERA5 - NASA| mean <= 25: {v(all(abs(d) <= 25 for d in diffs.values()))} ("
          + ", ".join(f"{t} {d:+.1f}" for t, d in diffs.items()) + ")")
    print(f"E9 LC mean pp72 > AT_90 pp72: {v(m('LC', 'pp72') > E['pp72']['AT_90'])} "
          f"({m('LC', 'pp72'):.1f} vs {E['pp72']['AT_90']})")


if __name__ == "__main__":
    main()
