"""Milestone 6zzzg: is +/-3% an optimum or a plateau out of sample? A fixed-width sweep of the clamp on the learned
month ratios, scored on 2020 to 2025 under the 2005 to 2014 climatology (6zzzf's design).

Why: 6zzzf's second "Next". The fixed +/-3% clamp (C03) was the only rule above no correction in all twelve scored
rows of 6zzze and 6zzzf, but +/-3% was itself picked as the best of eleven fixed widths on the in-sample years (6zzy:
all168 C01 148.0, C02 152.4, C03 152.6, C04 152.0, C05 151.4, a flat top). 2020 to 2025 under the old climatology is
the first scoring of fixed widths that no width was tuned on. If the top is a plateau, the designer rule is "a narrow
clamp, about 2 to 5%"; if it is a sharp optimum that moves, ±3% is a lucky pick.

Design (fixed here, before any configuration below was run):
  6zzzf's code unchanged (experiments/run_old_clim_2025.py, which is 6zzze's experiments/run_oos_2025.py with
  fy.CLIM_YEARS = 2005 to 2014): scored years 2020 to 2025, each learning from the k seasons Y - g for every k-subset
  of lags {1..5}; 50 W; packs 2.5 / 5 / 10 / 20 kWh; real shape plus the 20 swept shapes; nasa world; counts all84,
  eq84, hi84, eq9, pp120; "dominates B" as 6zv.
  Rules: fixed clamps on the raw learned month ratios, half-widths 0.01, 0.02, 0.03, 0.04, 0.05, 0.07, 0.10 (tags C01
  to C10); AT_90 (h = 0, no correction) is the left end of the curve. k in {1, 3, 5} only (5, 10 and 1 sets), to keep
  the run under an hour on 4 cores; k = 3 is the headline, as in 6zzze and 6zzzf.
  "Six-year mean" = the mean over 2020 to 2025 of the set-mean count. "Best width" = the h with the highest six-year
  mean (ties go to the narrower h).
  hi84 and eq9 use 6zzzf's five-point pool (the high-amplitude set depends on the climatology); no prediction uses
  them.
  Checks (must hold or the run is wrong): AT_90 all84 per year equals 6zzzf's (55, 43, 62, 57, 58, 61); C03 2025
  all84 at k = 1, 3, 5 equals 6zzzf's 63.6, 66.0, 67.0.

Predictions (priors in brackets), all84 unless stated:
  W1 At k = 3 the best width on the six-year mean is 0.02, 0.03 or 0.04. [60%]
  W2 Plateau: at k = 3, C02, C03 and C04 are each within 2 cells of the best width's six-year mean. [50%]
  W3 At k = 3, C03 is within 2 cells of the best width's six-year mean. [60%]
  W4 The curve turns down: at k = 3, C10's six-year mean < C03's. [80%]
  W5 Every width 0.01 to 0.05 beats AT_90 on the six-year mean at k = 3. [70%]
  W6 C01 at k = 3 beats AT_90 in every one of the six years. [50%]
  W7 The best width on 2025 alone at k = 3 is within 0.01 of the six-year best. [50%]
  W8 More log does not narrow the best width: best width at k = 5 >= best width at k = 1 (six-year means). [55%]
  W9 Per point (pp120, real shape) the six-year best width at k = 3 is <= 0.02. [50%]
  W10 Stability: the six-year best width at k = 3 is within 2 cells of that year's best width in at least 4 of the
      six years. [50%]

Run (from research/marine-hull): PYTHONPATH=src python3 experiments/run_width_oos.py > experiments/results_width_oos.txt
(stdlib, deterministic; up to 4 processes). --smoke times a handful of keys and prints nothing about results."""
import os
import statistics as st
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import run_old_clim_2025 as oc  # noqa: E402  (sets fy.CLIM_YEARS to 2005 to 2014 on import)

oz, fy = oc.oz, oc.fy
WIDTHS = (0.01, 0.02, 0.03, 0.04, 0.05, 0.07, 0.10)


def tag(h):
    return f"C{round(h * 100):02d}"


TAG_ORDER = tuple(tag(h) for h in WIDTHS)
KS = (1, 3, 5)
_NAMES = ("FIXED", "KS", "TAGS", "TAG_ORDER", "RULES")


def configure():
    """Reconfigure 6zzze's rule set in place (before the worker pool forks): only fixed clamps, only these k.
    Returns the previous values, for restore() (tests share the process with 6zzze's)."""
    saved = {n: getattr(oz, n) for n in _NAMES}
    oz.corrections.cache_clear()
    oz.FIXED = {tag(h): h for h in WIDTHS}
    oz.KS = KS
    oz.TAGS = {k: TAG_ORDER for k in KS}
    oz.TAG_ORDER = TAG_ORDER
    oz.RULES = ("AT_90",) + tuple(oz.rname(t, s) for k in KS for t in TAG_ORDER for s in oz.SETS[k])
    return saved


def restore(saved):
    for n, v in saved.items():
        setattr(oz, n, v)
    oz.corrections.cache_clear()


YEARS, OOS = oc.YEARS, oc.OOS
# 6zzzf (experiments/results_old_clim_2025.txt)
CHECK_AT90 = {2020: 55.0, 2021: 43.0, 2022: 62.0, 2023: 57.0, 2024: 58.0, 2025: 61.0}
CHECK_C03_2025 = {1: 63.6, 3: 66.0, 5: 67.0}


def six_year(C, f, t, k):
    return st.mean(oz.setmean(C[y][f], t, k)[0] for y in YEARS)


def best(scores):
    """(h, score) of the highest score; ties go to the narrower h."""
    return max(((s, -h) for h, s in scores.items()))[1] * -1, max(scores.values())


def main():
    configure()
    assert fy.CLIM_YEARS == oc.OLD_CLIM
    oz.load_2025()
    pts = tuple(oz.bt.PTS)
    hi = oz.ls.high_amp_points()
    if "--smoke" in sys.argv:
        keys = [(c, p, yr) + oz.ls.REAL for p in pts[:10] for yr in (2022, OOS) for c in oz.PACKS[:2]]
        t0 = time.time()
        oz.evaluate(keys)
        dt = time.time() - t0
        full = len(pts) * len(YEARS) * len(oz.PACKS) * len(oz.SHAPES)
        print(f"smoke: {len(keys)} keys in {dt:.1f} s; full run {full} keys, about {dt / len(keys) * full / 60:.0f} min")
        return
    keys = [(c, p, yr) + sh for p in pts for yr in YEARS for sh in oz.SHAPES for c in oz.PACKS]
    t0 = time.time()
    cells = oz.evaluate(keys)
    C = {yr: oz.counts(cells, yr, pts, hi) for yr in YEARS}
    print("Milestone 6zzzg: fixed clamp widths +/-1% to +/-10% on the learned month ratios, scored on 2020 to 2025 "
          "with the climatology built from 2005 to 2014 (6zzzf's design); each year learns from the k seasons before "
          "it; 50 W")
    print(f"points 30; five-point high-amplitude pool: {', '.join(hi)}; {len(keys)} scored keys; "
          f"run {time.time() - t0:.0f} s")

    print("\nChecks against 6zzzf:")
    ok_all = True
    for y in YEARS:
        ok = C[y]["all84"]["AT_90"] == CHECK_AT90[y]
        ok_all &= ok
        print(f"  AT_90 all84 {y}: {C[y]['all84']['AT_90']:.1f} (6zzzf {CHECK_AT90[y]:.1f}) {'ok' if ok else 'FAIL'}")
    for k, v in CHECK_C03_2025.items():
        got = oz.setmean(C[OOS]["all84"], "C03", k)[0]
        ok = abs(got - v) < 0.05
        ok_all &= ok
        print(f"  C03 k={k} all84 2025: {got:.1f} (6zzzf {v:.1f}) {'ok' if ok else 'FAIL'}")
    print(f"  {'all checks passed' if ok_all else 'CHECKS FAILED'}")

    foot = ("all84", "eq84", "pp120", "hi84", "eq9")
    for f in foot:
        print(f"\n{f}: set-mean count per year, width and k (h = 0 is AT_90); last column the six-year mean")
        print("  " + " " * 9 + "  ".join(f"{y:>6d}" for y in YEARS) + "    mean")
        print("  h=0.00    " + "  ".join(f"{C[y][f]['AT_90']:6.1f}" for y in YEARS) +
              f"  {st.mean(C[y][f]['AT_90'] for y in YEARS):6.1f}")
        for k in KS:
            for h in WIDTHS:
                t = tag(h)
                xs = [oz.setmean(C[y][f], t, k)[0] for y in YEARS]
                print(f"  h={h:.2f} k={k} " + "  ".join(f"{x:6.1f}" for x in xs) + f"  {st.mean(xs):6.1f}")

    print("\nall84 at k = 3, gain over AT_90 per year and width:")
    for h in WIDTHS:
        t = tag(h)
        g = [oz.setmean(C[y]["all84"], t, 3)[0] - C[y]["all84"]["AT_90"] for y in YEARS]
        print(f"  {t}: " + "  ".join(f"{x:+6.1f}" for x in g) + f"   years above AT_90: {sum(x > 0 for x in g)} of 6;"
              f" worst {min(g):+.1f}")

    print("\nShare of real-shape learned month ratios outside +/-h, all 30 points, k = 3 sets pooled, by scored year:")
    for h in WIDTHS:
        row = []
        for y in YEARS:
            rs = [x for p in pts for s in oz.SETS[3] for x in oz.lv.raw(p, oz.learn_years(y, s), oz.ls.REAL)[0]]
            row.append(sum(abs(x - 1) > h for x in rs) / len(rs))
        print(f"  {tag(h)}: " + "  ".join(f"{x:.3f}" for x in row))

    print("\nTotals over the 30 points, real shape, 2025, 2.5 kWh: km and excess dark h")
    t = oz.tot(cells, [(oz.PACKS[0], p, OOS) + oz.ls.REAL for p in pts])
    print("  " + "  ".join(f"{g} {t[g][0]:.0f} km / {t[g][1]:.0f} h"
                           for g in (oz.BASE, "AT_90") + tuple(oz.rname(tg, (1, 2, 3)) for tg in TAG_ORDER)))

    six = {k: {h: six_year(C, "all84", tag(h), k) for h in WIDTHS} for k in KS}
    bh3, bs3 = best(six[3])
    at6 = st.mean(C[y]["all84"]["AT_90"] for y in YEARS)
    y25 = {h: oz.setmean(C[OOS]["all84"], tag(h), 3)[0] for h in WIDTHS}
    pp6 = {h: six_year(C, "pp120", tag(h), 3) for h in WIDTHS}
    per_year_ok = 0
    for y in YEARS:
        sc = {h: oz.setmean(C[y]["all84"], tag(h), 3)[0] for h in WIDTHS}
        per_year_ok += sc[bh3] >= max(sc.values()) - 2
    c01 = [oz.setmean(C[y]["all84"], "C01", 3)[0] > C[y]["all84"]["AT_90"] for y in YEARS]
    print(f"\nBest width by six-year mean all84: " + "  ".join(f"k={k} {tag(best(six[k])[0])} {best(six[k])[1]:.1f}"
                                                         for k in KS) + f"; AT_90 {at6:.1f}")
    print("\nPredictions:")
    res = [
        ("W1 k=3 six-year best width in {0.02, 0.03, 0.04}", bh3 in (0.02, 0.03, 0.04), f"{tag(bh3)} {bs3:.1f}"),
        ("W2 k=3 C02, C03, C04 each within 2 of the best", all(six[3][h] >= bs3 - 2 for h in (0.02, 0.03, 0.04)),
         " / ".join(f"{tag(h)} {six[3][h]:.1f}" for h in (0.02, 0.03, 0.04)) + f" vs {bs3:.1f}"),
        ("W3 k=3 C03 within 2 of the best", six[3][0.03] >= bs3 - 2, f"{six[3][0.03]:.1f} vs {bs3:.1f}"),
        ("W4 k=3 C10 < C03", six[3][0.10] < six[3][0.03], f"{six[3][0.10]:.1f} vs {six[3][0.03]:.1f}"),
        ("W5 k=3 every width 0.01 to 0.05 > AT_90", all(six[3][h] > at6 for h in WIDTHS[:5]),
         " / ".join(f"{tag(h)} {six[3][h]:.1f}" for h in WIDTHS[:5]) + f" vs {at6:.1f}"),
        ("W6 k=3 C01 > AT_90 in all six years", all(c01), f"{sum(c01)} of 6"),
        ("W7 2025's best width within 0.01 of the six-year best", abs(best(y25)[0] - bh3) <= 0.0101,
         f"2025 {tag(best(y25)[0])} {best(y25)[1]:.1f}; six-year {tag(bh3)}"),
        ("W8 best width k=5 >= k=1", best(six[5])[0] >= best(six[1])[0],
         f"k=5 {tag(best(six[5])[0])}, k=1 {tag(best(six[1])[0])}"),
        ("W9 pp120 k=3 six-year best width <= 0.02", best(pp6)[0] <= 0.02, f"{tag(best(pp6)[0])} {best(pp6)[1]:.1f}"),
        ("W10 six-year best within 2 of each year's best in >= 4 years", per_year_ok >= 4, f"{per_year_ok} of 6"),
    ]
    for name, ok, detail in res:
        print(f"  {name}: {'held' if ok else 'refuted'} ({detail})")
    print(f"  {sum(ok for _, ok, _ in res)} of {len(res)} held")


if __name__ == "__main__":
    main()
