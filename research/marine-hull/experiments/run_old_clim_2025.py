"""Milestone 6zzzf: is 2025's smaller margin for the learned sun corrections (6zzze) a decade-offset artefact? Score
2025 again with the climatology built from 2005 to 2014, so the learning years (2020 to 2024) lie outside it, as the
in-sample learning years did in 6zzze.

Why: 6zzze's first limit. In 6zzze the 2025 corrections learned from 2020 to 2024, years inside the 2015 to 2024
climatology (each judged against the other nine), while the in-sample corrections learned from 2005 to 2013, outside
it, so they could learn a decade-level offset (realised 0.989 to 0.998) the 2025 ones could not. AP's mean half-width
at k = 3 was 0.031 in 2025 against 0.038 to 0.040 in-sample. This step removes that asymmetry.

Design (fixed here, before any configuration below was run):
  Climatology: 2005 to 2014 (fy.CLIM_YEARS overridden in this process and its workers), leave-one-out by year as the
  code always did (no scored or learning year here lies inside it, so nothing is left out).
  Scored years: 2025 (out of sample) and, as the reference under the same design, each of 2020 to 2024. Each scored
  year Y learns from the k seasons Y - g for every k-subset S of lags {1..5}, so 2025 learns from 2020 to 2024 and
  2020 from 2015 to 2019: learning years always lie in the decade after the climatology, the mirror of 6zzze's
  in-sample design (climatology 2015 to 2024, learning and scoring 2005 to 2014).
  Everything else is 6zzze's code unchanged (experiments/run_oos_2025.py): rules AP, AK, A1, C03, C15, HR (k >= 2),
  AT_90 and B; 50 W; packs 2.5 / 5 / 10 / 20 kWh; real shape plus 20 swept shapes; nasa world; counts all84, eq84,
  hi84, eq9, pp120. The climatology also sets B's and AT_90's plans, so their 2025 counts move too; the comparison
  with 6zzze is therefore per rule against AT_90 under the same climatology (the "gain").
  6zzze's 2025 numbers (climatology 2015 to 2024) quoted below are from experiments/results_oos_2025.txt.

Predictions (priors in brackets), on 2025 unless stated:
  D1 AP's mean half-width h on the real shape over the 30 points at k = 3 is >= 0.035 (6zzze: 0.031). [70%]
  D2 |realised 2025 harvest / climatology - 1| over the 30 points exceeds 6zzze's 0.0082. [55%]
  D3 AP k = 3 all84 (mean of its 10 sets) >= AT_90's all84. [75%]
  D4 AP k = 3's gain over AT_90 on all84 exceeds 6zzze's +5.2. [55%]
  D5 the narrow three lead the wide three: min(AP, C03, HR) > max(AK, A1, C15) on all84 at k = 3. [60%]
  D6 the wide three all fall below AT_90 on all84 at k = 3 (as in 6zzze). [50%]
  D7 AP k = 3 all84 lies within the 2020 to 2024 reference range of its set means. [55%]
  D8 AP's set-mean all84 is non-decreasing from k = 1 to k = 3. [55%]

Run (from research/marine-hull): PYTHONPATH=src python3 experiments/run_old_clim_2025.py > experiments/results_old_clim_2025.txt
(stdlib, deterministic; up to 4 processes). --smoke times a handful of keys and prints nothing about results."""
import os
import statistics as st
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import run_fresh_years as fy  # noqa: E402

OLD_CLIM = tuple(range(2005, 2015))
DEFAULT_CLIM = fy.CLIM_YEARS


def _clear_caches():
    """Clear every lru_cache in the loaded experiment modules (the climatology feeds several of them)."""
    for m in list(sys.modules.values()):
        if getattr(m, "__name__", "").startswith("run_"):
            for v in list(vars(m).values()):
                if callable(getattr(v, "cache_clear", None)):
                    v.cache_clear()


def use_clim(years):
    fy.CLIM_YEARS = tuple(years)
    _clear_caches()


use_clim(OLD_CLIM)  # on import, before any fy._clim call, so every cache below is built on the old decade
import run_oos_2025 as oz  # noqa: E402

OOS = oz.OOS
REF = (2020, 2021, 2022, 2023, 2024)
YEARS = REF + (OOS,)
KS, SETS, TAGS, TAG_ORDER, SHAPES, PACKS = oz.KS, oz.SETS, oz.TAGS, oz.TAG_ORDER, oz.SHAPES, oz.PACKS
WIDE, NARROW = ("AK", "A1", "C15"), ("AP", "C03", "HR")
# 6zzze, 2025 under the 2015 to 2024 climatology (experiments/results_oos_2025.txt)
NEW_CLIM_2025 = {"AT_90": 63.0, "AP": 68.2, "AK": 56.7, "A1": 53.8, "C03": 69.3, "C15": 53.7, "HR": 69.3,
                 "realised": 1.0082, "h_AP_k3": 0.031}


def main():
    assert fy.CLIM_YEARS == OLD_CLIM
    assert all(y not in OLD_CLIM for yr in YEARS for k in KS for S in SETS[k] for y in oz.learn_years(yr, S))
    oz.load_2025()
    pts = tuple(oz.bt.PTS)
    hi = oz.ls.high_amp_points()
    if "--smoke" in sys.argv:
        keys = [(c, p, yr) + oz.ls.REAL for p in pts[:10] for yr in (2022, OOS) for c in PACKS[:2]]
        t0 = time.time()
        oz.evaluate(keys)
        dt = time.time() - t0
        full = len(pts) * len(YEARS) * len(PACKS) * len(SHAPES)
        print(f"smoke: {len(keys)} keys in {dt:.1f} s; full run {full} keys, about {dt / len(keys) * full / 60:.0f} min")
        return
    keys = [(c, p, yr) + sh for p in pts for yr in YEARS for sh in SHAPES for c in PACKS]
    t0 = time.time()
    cells = oz.evaluate(keys)
    C = {yr: oz.counts(cells, yr, pts, hi) for yr in YEARS}
    print("Milestone 6zzzf: learned sun corrections scored on 2025 and on 2020 to 2024 (reference) with the climatology "
          "built from 2005 to 2014, so every learning year lies outside it; each year learns from the k seasons before "
          "it; 50 W")
    print(f"points 30; high-amplitude nine: {', '.join(hi)}; {len(keys)} scored keys; run {time.time() - t0:.0f} s")
    print("\nRealised harvest / climatology (2005 to 2014) over the 30 points (and the nine):")
    for yr in YEARS:
        print(f"  {yr}: {oz.realised(yr, pts):.4f}  ({oz.realised(yr, hi):.4f})")
    print("\nAP's mean half-width h on the real shape, all 30 points, by k:")
    for yr in YEARS:
        print(f"  {yr}: " + "  ".join(f"k{k} {oz.mean_h(yr, pts, 'AP', k):.3f}" for k in KS))

    foot = ("all84", "eq84", "hi84", "eq9", "pp120")
    print("\nSet-mean count per rule, k and footing: 2025 [min set, max set] | reference mean [min year, max year]")
    print("  AT_90: " + " | ".join(f"{f} {C[OOS][f]['AT_90']:.1f} / {st.mean(C[y][f]['AT_90'] for y in REF):.1f} "
                                   f"[{min(C[y][f]['AT_90'] for y in REF):.1f}, "
                                   f"{max(C[y][f]['AT_90'] for y in REF):.1f}]" for f in foot))
    summ = {}
    for k in KS:
        for t in TAG_ORDER:
            if t not in TAGS[k]:
                continue
            row = []
            for f in foot:
                o = oz.setmean(C[OOS][f], t, k)
                ref = [oz.setmean(C[y][f], t, k)[0] for y in REF]
                summ[(t, k, f)] = (o[0], st.mean(ref), min(ref), max(ref))
                row.append(f"{f} {o[0]:5.1f} [{o[1]:.0f},{o[2]:.0f}] / {st.mean(ref):5.1f} [{min(ref):.1f}, "
                           f"{max(ref):.1f}]")
            print(f"  {t:3s} k={k}: " + " | ".join(row))

    for f in ("all84", "eq84"):
        print(f"\nPer scored year, set-mean {f} at k = 3 (AT_90 first):")
        for yr in YEARS:
            print(f"  {yr}: AT_90 {C[yr][f]['AT_90']:.1f}  " +
                  "  ".join(f"{t} {oz.setmean(C[yr][f], t, 3)[0]:.1f}" for t in TAG_ORDER))

    at = C[OOS]["all84"]["AT_90"]
    s = lambda t, k, f="all84": summ[(t, k, f)][0]  # noqa: E731
    print("\n2025, all84 at k = 3, gain over AT_90 under each climatology (6zzze's 2015 to 2024 | this step's 2005 to "
          "2014):")
    for t in TAG_ORDER:
        print(f"  {t}: {NEW_CLIM_2025[t] - NEW_CLIM_2025['AT_90']:+.1f} | {s(t, 3) - at:+.1f}")
    print(f"  AT_90 itself: {NEW_CLIM_2025['AT_90']:.0f} | {at:.0f}")

    print("\nTotals over the 30 points, real shape, 2025, by pack: km and excess dark h for B, AT_90, AP_123, AK_123,"
          " HR_123")
    for c in PACKS:
        t = oz.tot(cells, [(c, p, OOS) + oz.ls.REAL for p in pts])
        print(f"  {c:5.1f} kWh: " + "  ".join(f"{g} {t[g][0]:.0f} km / {t[g][1]:.0f} h"
                                               for g in (oz.BASE, "AT_90", "AP_123", "AK_123", "HR_123")))

    hk3 = oz.mean_h(OOS, pts, "AP", 3)
    rl = oz.realised(OOS, pts)
    print("\nPredictions:")
    res = [
        ("D1 AP mean h at k=3 >= 0.035", hk3 >= 0.035, f"{hk3:.3f} (6zzze 0.031)"),
        ("D2 |realised - 1| > 0.0082", abs(rl - 1) > 0.0082, f"{rl:.4f}"),
        ("D3 AP k=3 all84 >= AT_90", s("AP", 3) >= at, f"{s('AP', 3):.1f} vs {at:.0f}"),
        ("D4 AP k=3 gain over AT_90 > +5.2", s("AP", 3) - at > 5.2, f"{s('AP', 3) - at:+.1f}"),
        ("D5 min(AP, C03, HR) > max(AK, A1, C15) at k=3", min(s(t, 3) for t in NARROW) > max(s(t, 3) for t in WIDE),
         " / ".join(f"{t} {s(t, 3):.1f}" for t in NARROW + WIDE)),
        ("D6 AK, A1, C15 all < AT_90 at k=3", all(s(t, 3) < at for t in WIDE),
         " / ".join(f"{t} {s(t, 3):.1f}" for t in WIDE) + f" vs {at:.0f}"),
        ("D7 AP k=3 within the 2020 to 2024 range", summ[("AP", 3, "all84")][2] <= s("AP", 3) <= summ[("AP", 3, "all84")][3],
         f"{s('AP', 3):.1f} in [{summ[('AP', 3, 'all84')][2]:.1f}, {summ[('AP', 3, 'all84')][3]:.1f}]"),
        ("D8 AP non-decreasing k=1..3", s("AP", 1) <= s("AP", 2) <= s("AP", 3),
         f"{s('AP', 1):.1f} / {s('AP', 2):.1f} / {s('AP', 3):.1f}"),
    ]
    for name, ok, detail in res:
        print(f"  {name}: {'held' if ok else 'refuted'} ({detail})")
    print(f"  {sum(ok for _, ok, _ in res)} of {len(res)} held")


if __name__ == "__main__":
    main()
