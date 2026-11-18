"""Milestone 6zzzh: does the +/-2% to +/-4% plateau move with the climatology? 6zzzg's fixed-width sweep, rescored
under 6zzze's climatology (2015 to 2024, leave-one-out by year) on 2010 to 2014, 2020 to 2024 and 2025.

Why: 6zzzg's second "Next". 6zzzg found a plateau from +/-2% to +/-4% (k = 3 six-year means C02 62.9, C03 63.1, C04
62.3 against AT_90's 56.0 of 84) on 2020 to 2025 under the 2005 to 2014 climatology, a design in which every learning
year lies in the decade after the climatology, so the learned month ratios carry a decade-level offset (realised
harvest 0.5 to 1.8% above it) that a wider clamp lets through. Under the 2015 to 2024 climatology the same scored
years 2020 to 2025 learn from years inside it (no offset to learn), while 2010 to 2014 learn from 2005 to 2013,
outside it and before it. So this step separates two readings of the plateau: (a) a property of the month-ratio noise
(it stays where it is whatever the climatology), or (b) a property of the offset (it narrows when there is no offset
to learn and holds or widens when there is).

Design (fixed here, before any configuration below was run):
  6zzze's code unchanged (experiments/run_oos_2025.py, climatology fy.CLIM_YEARS = 2015 to 2024, leave-one-out by
  year), with 6zzzg's rule set (experiments/run_width_oos.py configure(): fixed clamps on the raw learned month
  ratios, half-widths 0.01, 0.02, 0.03, 0.04, 0.05, 0.07, 0.10, tags C01 to C10; AT_90 is h = 0; k in {1, 3, 5}).
  Scored years, each learning from the k seasons Y - g for every k-subset of lags {1..5}:
    OUT = 2010 to 2014 (learning years 2005 to 2013, outside the climatology, as 6zzze's in-sample reference);
    IN  = 2020 to 2025 (learning years 2015 to 2024, inside the climatology; the same scored years as 6zzzg, so each
          year pairs with 6zzzg's row and only the climatology differs).
  50 W; packs 2.5 / 5 / 10 / 20 kWh; real shape plus the 20 swept shapes; nasa world; counts all84, eq84, hi84, eq9,
  pp120 as 6zzze (hi84 and eq9 on 6zzze's nine-point pool); "dominates B" as 6zv.
  "Mean" = the mean over a group's years of the set-mean count; "best width" = the h with the highest mean (ties go
  to the narrower h). OUT's years are among those +/-3% was picked on (6zzy), so OUT is in-sample for the width and
  IN is not.
  Checks (must hold or the run is wrong): AT_90 all84 per year equals 6zzze's for 2010 to 2014 and 2025 (66, 77, 80,
  68, 67, 63); C03 all84 at k = 3 equals 6zzze's 81.3, 83.0, 80.9, 76.7, 73.0 (2010 to 2014) and 69.3 (2025); C03
  2025 at k = 1 and 5 equals 63.8 and 69.0.

Predictions (priors in brackets), all84 at k = 3 unless stated:
  N1 IN's best width is 0.01 or 0.02 (narrower than 6zzzg's 0.03 on the same years). [55%]
  N2 OUT's best width is 0.02, 0.03 or 0.04. [60%]
  N3 OUT's best width >= IN's best width. [65%]
  N4 The gain of the best width over AT_90 on IN's mean is smaller than 6zzzg's (+7.1 = 63.1 - 56.0). [60%]
  N5 C02 beats AT_90 in every IN year and every OUT year (11 of 11). [50%]
  N6 Wide clamps lose more with no offset: C10's IN mean gain over AT_90 is below 6zzzg's (56.2 - 56.0 = +0.2). [60%]
  N7 Paired by year, 2020 to 2025: C10's gain over AT_90 is smaller than 6zzzg's in at least 4 of the 6 years. [55%]
  N8 Plateau on IN: C01, C02 and C03 are each within 2 cells of IN's best. [50%]
  N9 Share of IN's real-shape learned month ratios outside +/-3% is below 6zzzg's (0.45 at k = 3, mean over years).
      [70%]
  N10 Per point (pp120, real shape), no width beats AT_90 on IN's mean (as in 6zzzg). [60%]

Run (from research/marine-hull): PYTHONPATH=src python3 experiments/run_width_new_clim.py > experiments/results_width_new_clim.txt
(stdlib, deterministic; up to 4 processes). --smoke times a handful of keys and prints nothing about results."""
import os
import statistics as st
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import run_width_oos as wo  # noqa: E402  (importing it switches to the 2005 to 2014 climatology; undone in use_new())

oc, oz, fy = wo.oc, wo.oz, wo.fy
WIDTHS, TAG_ORDER, KS, tag, best = wo.WIDTHS, wo.TAG_ORDER, wo.KS, wo.tag, wo.best
configure, restore = wo.configure, wo.restore
OUT = (2010, 2011, 2012, 2013, 2014)
IN = (2020, 2021, 2022, 2023, 2024, 2025)
YEARS = OUT + IN
GROUPS = {"OUT": OUT, "IN": IN}
# 6zzze (experiments/results_oos_2025.txt)
CHECK_AT90 = {2010: 66.0, 2011: 77.0, 2012: 80.0, 2013: 68.0, 2014: 67.0, 2025: 63.0}
CHECK_C03_K3 = {2010: 81.3, 2011: 83.0, 2012: 80.9, 2013: 76.7, 2014: 73.0, 2025: 69.3}
CHECK_C03_2025 = {1: 63.8, 5: 69.0}
# 6zzzg (experiments/results_width_oos.txt), 2020 to 2025 under the 2005 to 2014 climatology, all84 at k = 3
G_AT90 = {2020: 55.0, 2021: 43.0, 2022: 62.0, 2023: 57.0, 2024: 58.0, 2025: 61.0}
G_SIX = {0.01: 59.7, 0.02: 62.9, 0.03: 63.1, 0.04: 62.3, 0.05: 61.1, 0.07: 58.2, 0.10: 56.2}
G_C10_GAIN = None  # filled from the committed 6zzzg results file by g_gains()
G_OUT3 = 0.45


def use_new():
    oc.use_clim(oc.DEFAULT_CLIM)


def g_gains(t="C10"):
    """6zzzg's per-year all84 gain over AT_90 at k = 3 for tag t, read from its committed results."""
    txt = open(os.path.join(HERE, "results_width_oos.txt")).read()
    line = next(x for x in txt.splitlines() if x.strip().startswith(f"{t}: ") and "years above AT_90" in x)
    return dict(zip(IN, (float(v) for v in line.split(":")[1].split("years")[0].split())))


def group_mean(C, f, t, k, years):
    return st.mean(oz.setmean(C[y][f], t, k)[0] for y in years)


def main():
    use_new()
    saved = configure()
    assert fy.CLIM_YEARS == tuple(range(2015, 2025))
    oz.load_2025()
    pts = tuple(oz.bt.PTS)
    hi = oz.ls.high_amp_points()
    if "--smoke" in sys.argv:
        keys = [(c, p, yr) + oz.ls.REAL for p in pts[:10] for yr in (2012, 2022, 2025) for c in oz.PACKS[:2]]
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
    print("Milestone 6zzzh: fixed clamp widths +/-1% to +/-10% on the learned month ratios under the 2015 to 2024 "
          "climatology (6zzze's design), scored on 2010 to 2014 (learning outside it) and 2020 to 2025 (learning "
          "inside it); each year learns from the k seasons before it; 50 W")
    print(f"points 30; high-amplitude nine: {', '.join(hi)}; {len(keys)} scored keys; run {time.time() - t0:.0f} s")

    print("\nChecks against 6zzze:")
    ok_all = True
    for y, v in CHECK_AT90.items():
        ok = C[y]["all84"]["AT_90"] == v
        ok_all &= ok
        print(f"  AT_90 all84 {y}: {C[y]['all84']['AT_90']:.1f} (6zzze {v:.1f}) {'ok' if ok else 'FAIL'}")
    for y, v in CHECK_C03_K3.items():
        got = oz.setmean(C[y]["all84"], "C03", 3)[0]
        ok = abs(got - v) < 0.05
        ok_all &= ok
        print(f"  C03 k=3 all84 {y}: {got:.1f} (6zzze {v:.1f}) {'ok' if ok else 'FAIL'}")
    for k, v in CHECK_C03_2025.items():
        got = oz.setmean(C[2025]["all84"], "C03", k)[0]
        ok = abs(got - v) < 0.05
        ok_all &= ok
        print(f"  C03 k={k} all84 2025: {got:.1f} (6zzze {v:.1f}) {'ok' if ok else 'FAIL'}")
    print(f"  {'all checks passed' if ok_all else 'CHECKS FAILED'}")

    print("\nRealised harvest / climatology (2015 to 2024, leave-one-out) over the 30 points:")
    print("  " + "  ".join(f"{y} {oz.realised(y, pts):.4f}" for y in YEARS))

    for f in ("all84", "eq84", "pp120", "hi84", "eq9"):
        print(f"\n{f}: set-mean count per year, width and k (h = 0 is AT_90); last two columns the OUT and IN means")
        print("  " + " " * 9 + "  ".join(f"{y:>6d}" for y in YEARS) + "     OUT      IN")
        at = [C[y][f]["AT_90"] for y in YEARS]
        print("  h=0.00    " + "  ".join(f"{x:6.1f}" for x in at) +
              f"  {st.mean(at[:len(OUT)]):6.1f}  {st.mean(at[len(OUT):]):6.1f}")
        for k in KS:
            for h in WIDTHS:
                xs = [oz.setmean(C[y][f], tag(h), k)[0] for y in YEARS]
                print(f"  h={h:.2f} k={k} " + "  ".join(f"{x:6.1f}" for x in xs) +
                      f"  {st.mean(xs[:len(OUT)]):6.1f}  {st.mean(xs[len(OUT):]):6.1f}")

    print("\nall84 at k = 3, gain over AT_90 per year and width:")
    for h in WIDTHS:
        g = [oz.setmean(C[y]["all84"], tag(h), 3)[0] - C[y]["all84"]["AT_90"] for y in YEARS]
        go, gi = g[:len(OUT)], g[len(OUT):]
        print(f"  {tag(h)}: " + "  ".join(f"{x:+6.1f}" for x in g) +
              f"   OUT above {sum(x > 0 for x in go)} of 5, worst {min(go):+.1f}; IN above {sum(x > 0 for x in gi)} of 6,"
              f" worst {min(gi):+.1f}")

    print("\nPaired with 6zzzg (same scored years, 2005 to 2014 climatology), all84 gain over AT_90 at k = 3, "
          "2020 to 2025: 6zzzg | this step")
    paired = {}
    for h in WIDTHS:
        gg = g_gains(tag(h))
        mine = {y: oz.setmean(C[y]["all84"], tag(h), 3)[0] - C[y]["all84"]["AT_90"] for y in IN}
        paired[h] = (gg, mine)
        print(f"  {tag(h)}: " + "  ".join(f"{y} {gg[y]:+.1f} | {mine[y]:+.1f}" for y in IN) +
              f"   mean {st.mean(gg.values()):+.1f} | {st.mean(mine.values()):+.1f}")

    print("\nShare of real-shape learned month ratios outside +/-h, all 30 points, k = 3 sets pooled, by scored year:")
    share3 = {}
    for h in WIDTHS:
        row = []
        for y in YEARS:
            rs = [x for p in pts for s in oz.SETS[3] for x in oz.lv.raw(p, oz.learn_years(y, s), oz.ls.REAL)[0]]
            row.append(sum(abs(x - 1) > h for x in rs) / len(rs))
        share3[h] = row
        print(f"  {tag(h)}: " + "  ".join(f"{x:.3f}" for x in row) +
              f"   OUT {st.mean(row[:len(OUT)]):.3f}  IN {st.mean(row[len(OUT):]):.3f}")

    print("\nTotals over the 30 points, real shape, 2025, 2.5 kWh: km and excess dark h")
    t = oz.tot(cells, [(oz.PACKS[0], p, 2025) + oz.ls.REAL for p in pts])
    print("  " + "  ".join(f"{g} {t[g][0]:.0f} km / {t[g][1]:.0f} h"
                           for g in (oz.BASE, "AT_90") + tuple(oz.rname(tg, (1, 2, 3)) for tg in TAG_ORDER)))

    m = {(gn, k): {h: group_mean(C, "all84", tag(h), k, ys) for h in WIDTHS} for gn, ys in GROUPS.items() for k in KS}
    at = {gn: st.mean(C[y]["all84"]["AT_90"] for y in ys) for gn, ys in GROUPS.items()}
    print("\nBest width by group mean all84: " +
          "; ".join(f"{gn} " + " ".join(f"k={k} {tag(best(m[(gn, k)])[0])} {best(m[(gn, k)])[1]:.1f}" for k in KS) +
                    f" (AT_90 {at[gn]:.1f})" for gn in GROUPS))
    bi, si = best(m[("IN", 3)])
    bo, so = best(m[("OUT", 3)])
    pp = {h: group_mean(C, "pp120", tag(h), 3, IN) for h in WIDTHS}
    pp_at = st.mean(C[y]["pp120"]["AT_90"] for y in IN)
    c02 = [oz.setmean(C[y]["all84"], "C02", 3)[0] > C[y]["all84"]["AT_90"] for y in YEARS]
    g6 = G_SIX[0.03] - st.mean(G_AT90.values())
    c10_in = m[("IN", 3)][0.10] - at["IN"]
    c10_g = G_SIX[0.10] - st.mean(G_AT90.values())
    gg10, mine10 = paired[0.10]
    n7 = sum(mine10[y] < gg10[y] for y in IN)
    in3 = st.mean(share3[0.03][len(OUT):])
    print("\nPredictions:")
    res = [
        ("N1 IN best width in {0.01, 0.02}", bi in (0.01, 0.02), f"{tag(bi)} {si:.1f}"),
        ("N2 OUT best width in {0.02, 0.03, 0.04}", bo in (0.02, 0.03, 0.04), f"{tag(bo)} {so:.1f}"),
        ("N3 OUT best width >= IN best width", bo >= bi, f"OUT {tag(bo)}, IN {tag(bi)}"),
        ("N4 IN best gain over AT_90 < 6zzzg's +7.1", si - at["IN"] < g6, f"{si - at['IN']:+.1f} vs {g6:+.1f}"),
        ("N5 C02 > AT_90 in all 11 years", all(c02), f"{sum(c02)} of 11"),
        ("N6 C10 IN mean gain < 6zzzg's +0.2", c10_in < c10_g, f"{c10_in:+.1f} vs {c10_g:+.1f}"),
        ("N7 C10 paired gain below 6zzzg's in >= 4 of 6 years", n7 >= 4, f"{n7} of 6"),
        ("N8 IN: C01, C02, C03 each within 2 of the best", all(m[("IN", 3)][h] >= si - 2 for h in (0.01, 0.02, 0.03)),
         " / ".join(f"{tag(h)} {m[('IN', 3)][h]:.1f}" for h in (0.01, 0.02, 0.03)) + f" vs {si:.1f}"),
        ("N9 IN share outside +/-3% < 0.45", in3 < G_OUT3, f"{in3:.3f}"),
        ("N10 pp120 IN: no width beats AT_90", max(pp.values()) <= pp_at,
         f"best {tag(best(pp)[0])} {best(pp)[1]:.1f} vs AT_90 {pp_at:.1f}"),
    ]
    for name, ok, detail in res:
        print(f"  {name}: {'held' if ok else 'refuted'} ({detail})")
    print(f"  {sum(ok for _, ok, _ in res)} of {len(res)} held")
    restore(saved)


if __name__ == "__main__":
    main()
