"""Milestone 6zzzi: at the nine high-amplitude points, is the best clamp width wide because the season is large there,
or because the learning years carry a decade-level offset? 6zzzg's width sweep rescored at a fixed nine-point pool.

Why: 6zzzg's third "Next" ("restate the high-amplitude pool with a climatology-independent definition"). The pool
`ls.high_amp_points()` is the points whose measured climatology bias amplitude exceeds 6zz's line, and the measurement
uses the climatology, so under 6zzzg's 2005 to 2014 climatology it picked five points (P-60, P+60, A+60, North Sea,
Gulf of Alaska) and its hi84 and eq9 ranked nothing (AT_90 41.7, every width 40.4 to 42.0). Here the pool is frozen
as the nine points 6zz picked under the 2015 to 2024 climatology (P-60, P-30, P+50, P+60, A-50, A+50, A+60, North
Sea, Gulf of Alaska; the list printed in experiments/results_width_new_clim.txt), so hi84 at the nine is comparable
across designs. 6zzzh scored the same widths at those nine under the 2015 to 2024 climatology and found opposite
curves: with learning years outside the climatology (2010 to 2014) the widest clamp won (k = 3 hi84 C10 46.7 against
C02 34.0, AT_90 27.6); with learning years inside it (2020 to 2025) the narrow ones did (C01 39.7, C02 39.6, C10
36.0, AT_90 38.8). Two readings: (a) at high latitude the real season (4.5 to 8.5%, 6zz) exceeds a narrow clamp, so
a wide clamp is right whenever the log is long enough; (b) the wide clamp only wins by passing the decade offset of
learning years outside the climatology, as on the 30-point pool (6zzzh). Scoring 2020 to 2025 under the 2005 to 2014
climatology puts the learning years (2015 to 2024) outside it while keeping 6zzzh's IN scored years, so each year
pairs with 6zzzh's IN row and only the climatology differs. (b) predicts the wide clamp wins here; (a) predicts the
curve looks like 6zzzh's IN curve.

Design (fixed here, before the full run): 6zzzg's code and rule set unchanged (experiments/run_width_oos.py,
`configure()`): 2005 to 2014 climatology, scored years 2020 to 2025, each learning from every k-subset of lags
{1..5}, k in {1, 3, 5}; fixed clamps C01 to C10 on the raw learned month ratios, AT_90 = h 0; 50 W; packs 2.5 / 5 /
10 / 20 kWh; real shape plus the 20 swept shapes; nasa world; "dominates B" as 6zv. Only the nine points are
evaluated (keys at other points change no count used here). Footings at the nine: hi84 (km and dark hours summed
over the nine per shape and pack), eq9 (equal weight per point, zero-km ties dropped) and pp36 (per point, real
shape, 9 points x 4 packs). "Six-year mean", "best width" (ties to the narrower) as 6zzzg.
Checks (must hold or the run is wrong): on 6zzzg's five-point pool, a subset of the nine, hi84 from these cells
reproduces 6zzzg's: AT_90 per year 52, 63, 42, 0, 43, 50, and C03 at k = 3 55.3, 63.0, 42.0, 0.0, 42.0, 45.5.

Predictions (priors in brackets), hi84 at the nine, k = 3, six-year means unless stated:
  H1 The best width is 0.05 or wider (reading (b)). [55%]
  H2 C10 > C02. [55%]
  H3 Paired by year with 6zzzh's IN rows, C10's lead over C02 is larger under the old climatology in at least 4 of
     the 6 years. [65%]
  H4 C02 > AT_90. [65%]
  H5 C02 >= AT_90 in every one of the six years. [40%]
  H6 On eq9 the best width is 0.03 or narrower. [50%]
  H7 Realised harvest / climatology at the nine, mean over 2020 to 2025, exceeds the 30-point figure of 6zzzf's
     2020 to 2025 rows (1.005 to 1.018; here: exceeds 1.012). [50%]
  H8 The best width at k = 5 >= the best width at k = 1. [55%]

Run (from research/marine-hull): PYTHONPATH=src python3 experiments/run_width_hi9.py > experiments/results_width_hi9.txt
(stdlib, deterministic; up to 4 processes). --smoke times a handful of keys and prints nothing about results."""
import os
import re
import statistics as st
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import run_width_oos as wo  # noqa: E402  (sets fy.CLIM_YEARS to 2005 to 2014 on import)

oz, fy, oc = wo.oz, wo.fy, wo.oc
configure, restore, tag, best = wo.configure, wo.restore, wo.tag, wo.best
WIDTHS, KS, YEARS, OOS = wo.WIDTHS, wo.KS, wo.YEARS, wo.OOS

# 6zz's nine, as measured under the 2015 to 2024 climatology (experiments/results_width_new_clim.txt, line 2)
NINE = ("P-60", "P-30", "P+50", "P+60", "A-50", "A+50", "A+60", "North-Sea", "Gulf-of-Alaska")
FIVE = ("P-60", "P+60", "A+60", "North-Sea", "Gulf-of-Alaska")  # 6zzzg's pool (results_width_oos.txt, line 2)
CHECK_AT90_5 = {2020: 52.0, 2021: 63.0, 2022: 42.0, 2023: 0.0, 2024: 43.0, 2025: 50.0}
CHECK_C03_5 = {2020: 55.3, 2021: 63.0, 2022: 42.0, 2023: 0.0, 2024: 42.0, 2025: 45.5}


def new_clim_rows(footing="hi84", k=3):
    """6zzzh's IN rows (2020 to 2025) at the nine: {tag: {year: count}}, 'AT_90' included."""
    txt = open(os.path.join(HERE, "results_width_new_clim.txt")).read()
    block = txt.split(f"\n{footing}: set-mean count")[1].split("\n\n")[0].splitlines()
    years = [int(y) for y in block[1].split()[:11]]
    out = {}
    for line in block[2:]:
        m = re.match(r"\s+h=(\d\.\d\d)(?: k=(\d))?\s+(.*)", line)
        h, kk, vals = float(m.group(1)), m.group(2), [float(x) for x in m.group(3).split()[:11]]
        if h == 0:
            out["AT_90"] = dict(zip(years, vals))
        elif int(kk) == k:
            out[tag(h)] = dict(zip(years, vals))
    return {t: {y: v[y] for y in YEARS} for t, v in out.items()}


def main():
    configure()
    assert fy.CLIM_YEARS == oc.OLD_CLIM
    oz.load_2025()
    assert set(FIVE) <= set(NINE) and set(NINE) <= set(oz.bt.PTS)
    if "--smoke" in sys.argv:
        keys = [(c, p, yr) + oz.ls.REAL for p in NINE[:4] for yr in (2022, OOS) for c in oz.PACKS[:2]]
        t0 = time.time()
        oz.evaluate(keys)
        dt = time.time() - t0
        full = len(NINE) * len(YEARS) * len(oz.PACKS) * len(oz.SHAPES)
        print(f"smoke: {len(keys)} keys in {dt:.1f} s; full run {full} keys, about {dt / len(keys) * full / 60:.0f} min")
        return
    keys = [(c, p, yr) + sh for p in NINE for yr in YEARS for sh in oz.SHAPES for c in oz.PACKS]
    t0 = time.time()
    cells = oz.evaluate(keys)
    C9 = {yr: oz.counts(cells, yr, NINE, NINE) for yr in YEARS}
    C5 = {yr: oz.counts(cells, yr, FIVE, FIVE) for yr in YEARS}
    for yr in YEARS:  # counts() names its per-point footing pp120; over the nine it is pp36
        C9[yr]["pp36"] = C9[yr].pop("pp120")
    print("Milestone 6zzzi: 6zzzg's fixed clamp widths (+/-1% to +/-10%, 2005 to 2014 climatology, scored 2020 to "
          "2025) rescored at the fixed nine high-amplitude points of 6zz; 50 W")
    print(f"nine: {', '.join(NINE)}; {len(keys)} scored keys; run {time.time() - t0:.0f} s")

    print("\nChecks against 6zzzg (five-point pool, hi84):")
    ok_all = True
    for y in YEARS:
        a, c = C5[y]["hi84"]["AT_90"], oz.setmean(C5[y]["hi84"], "C03", 3)[0]
        ok = a == CHECK_AT90_5[y] and abs(c - CHECK_C03_5[y]) < 0.05
        ok_all &= ok
        print(f"  {y}: AT_90 {a:.1f} (6zzzg {CHECK_AT90_5[y]:.1f}), C03 k=3 {c:.1f} (6zzzg {CHECK_C03_5[y]:.1f}) "
              f"{'ok' if ok else 'FAIL'}")
    print(f"  {'all checks passed' if ok_all else 'CHECKS FAILED'}")

    for f in ("hi84", "eq9", "pp36"):
        print(f"\n{f} at the nine: set-mean count per year, width and k (h = 0 is AT_90); last column the six-year mean")
        print("  " + " " * 9 + "  ".join(f"{y:>6d}" for y in YEARS) + "    mean")
        print("  h=0.00    " + "  ".join(f"{C9[y][f]['AT_90']:6.1f}" for y in YEARS) +
              f"  {st.mean(C9[y][f]['AT_90'] for y in YEARS):6.1f}")
        for k in KS:
            for h in WIDTHS:
                xs = [oz.setmean(C9[y][f], tag(h), k)[0] for y in YEARS]
                print(f"  h={h:.2f} k={k} " + "  ".join(f"{x:6.1f}" for x in xs) + f"  {st.mean(xs):6.1f}")

    nc = new_clim_rows()
    print("\nhi84 at k = 3, gain over AT_90 per year, this step | 6zzzh IN (2015 to 2024 climatology, same years):")
    for h in WIDTHS:
        t = tag(h)
        g = [oz.setmean(C9[y]["hi84"], t, 3)[0] - C9[y]["hi84"]["AT_90"] for y in YEARS]
        n = [nc[t][y] - nc["AT_90"][y] for y in YEARS]
        print(f"  {t}: " + "  ".join(f"{a:+6.1f}|{b:+6.1f}" for a, b in zip(g, n)) +
              f"   mean {st.mean(g):+.1f} | {st.mean(n):+.1f}; years above AT_90 {sum(x > 0 for x in g)} of 6")

    print("\nRealised harvest / climatology at the nine, by year (2005 to 2014 climatology):")
    rz = {y: oz.realised(y, NINE) for y in YEARS}
    print("  " + "  ".join(f"{y} {rz[y]:.4f}" for y in YEARS) + f"; mean {st.mean(rz.values()):.4f}")
    print("Per point, 2025: " + "  ".join(f"{p} {oz.realised(OOS, (p,)):.4f}" for p in NINE))

    print("\nShare of real-shape learned month ratios outside +/-h at the nine, k = 3 sets pooled, 2020 to 2025:")
    rs = [x for y in YEARS for p in NINE for s in oz.SETS[3]
          for x in oz.lv.raw(p, oz.learn_years(y, s), oz.ls.REAL)[0]]
    print("  " + "  ".join(f"{tag(h)} {sum(abs(x - 1) > h for x in rs) / len(rs):.3f}" for h in WIDTHS))

    print("\nTotals over the nine, real shape, 2025, 2.5 kWh: km and excess dark h")
    t = oz.tot(cells, [(oz.PACKS[0], p, OOS) + oz.ls.REAL for p in NINE])
    print("  " + "  ".join(f"{g} {t[g][0]:.0f} km / {t[g][1]:.0f} h"
                           for g in (oz.BASE, "AT_90") + tuple(oz.rname(tg, (1, 2, 3)) for tg in wo.TAG_ORDER)))

    six = {f: {k: {h: wo.six_year(C9, f, tag(h), k) for h in WIDTHS} for k in KS} for f in ("hi84", "eq9")}
    at6 = st.mean(C9[y]["hi84"]["AT_90"] for y in YEARS)
    bh3, bs3 = best(six["hi84"][3])
    lead = {y: (oz.setmean(C9[y]["hi84"], "C10", 3)[0] - oz.setmean(C9[y]["hi84"], "C02", 3)[0],
                nc["C10"][y] - nc["C02"][y]) for y in YEARS}
    c02 = [oz.setmean(C9[y]["hi84"], "C02", 3)[0] >= C9[y]["hi84"]["AT_90"] for y in YEARS]
    rmean = st.mean(rz.values())
    print("\nBest width by six-year mean: " + "  ".join(
        f"{f} k={k} {tag(best(six[f][k])[0])} {best(six[f][k])[1]:.1f}" for f in ("hi84", "eq9") for k in KS) +
        f"; AT_90 hi84 {at6:.1f}, eq9 {st.mean(C9[y]['eq9']['AT_90'] for y in YEARS):.1f}")
    print("\nPredictions:")
    res = [
        ("H1 hi84 k=3 best width >= 0.05", bh3 >= 0.05, f"{tag(bh3)} {bs3:.1f}"),
        ("H2 hi84 k=3 C10 > C02", six["hi84"][3][0.10] > six["hi84"][3][0.02],
         f"{six['hi84'][3][0.10]:.1f} vs {six['hi84'][3][0.02]:.1f}"),
        ("H3 C10 - C02 larger than 6zzzh IN in >= 4 of 6 years", sum(a > b for a, b in lead.values()) >= 4,
         f"{sum(a > b for a, b in lead.values())} of 6"),
        ("H4 hi84 k=3 C02 > AT_90", six["hi84"][3][0.02] > at6, f"{six['hi84'][3][0.02]:.1f} vs {at6:.1f}"),
        ("H5 hi84 k=3 C02 >= AT_90 in all six years", all(c02), f"{sum(c02)} of 6"),
        ("H6 eq9 k=3 best width <= 0.03", best(six["eq9"][3])[0] <= 0.03,
         f"{tag(best(six['eq9'][3])[0])} {best(six['eq9'][3])[1]:.1f}"),
        ("H7 realised / climatology at the nine, six-year mean > 1.012", rmean > 1.012, f"{rmean:.4f}"),
        ("H8 hi84 best width k=5 >= k=1", best(six["hi84"][5])[0] >= best(six["hi84"][1])[0],
         f"k=5 {tag(best(six['hi84'][5])[0])}, k=1 {tag(best(six['hi84'][1])[0])}"),
    ]
    for name, ok, detail in res:
        print(f"  {name}: {'held' if ok else 'refuted'} ({detail})")
    print(f"  {sum(ok for _, ok, _ in res)} of {len(res)} held")


if __name__ == "__main__":
    main()
