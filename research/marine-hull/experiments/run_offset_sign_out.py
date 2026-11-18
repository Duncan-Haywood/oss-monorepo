"""Milestone 6zzzk: does a forced brightening remove the wide clamp's win at the nine high-amplitude points under
6zzzh's 2010 to 2014 design? 6zzzj's level-shift test, moved to the one design where the wide clamp won.

Why: 6zzzj's first "Next". 6zzzj forced a level shift d onto the learned month ratios (times 1 + d, then the clamp)
inside 6zzzi's design (2005 to 2014 climatology, scored 2020 to 2025, bright learned offset) and found hi84 at the
nine rising with d for every width, the wide clamp most of all, with failures almost all on distance against B. That
withdrew the "sign of the offset" reading and left open why the wide clamp won in 6zzzh's OUT group (2015 to 2024
climatology, scored 2010 to 2014, learning 2005 to 2013; k = 3 hi84 at the nine C10 46.7, C02 34.0, AT_90 27.6).
There the scored years are themselves dark against the climatology (realised over the 30 points 0.989 to 0.998,
results_width_new_clim.txt), and so are the learning years, so the dark offset the wide clamp passes is accurate.
Two readings:
  (A) accuracy: the wide clamp wins in OUT because the offset it passes is right for the scored years; a forced
      brightening moves the expectation away from the truth, so C10 falls as d rises and its lead over C02 shrinks.
  (K) boldness: as in 6zzzj, a brighter expectation buys distance at mostly parked high-latitude points whatever the
      truth, so hi84 rises with d for every width here too and C10's lead does not shrink.
The shift is the only change; the scored years, climatology, nine points and noise are 6zzzh's.

Design (fixed here, before the full run): 6zzzh's design (experiments/run_width_new_clim.py: 2015 to 2024
climatology, leave-one-out by year; scored years 2010 to 2014, each learning from the k = 3 subsets of lags {1..5},
10 lag sets) at 6zzzi's frozen nine (P-60, P-30, P+50, P+60, A-50, A+50, A+60, North Sea, Gulf of Alaska), 50 W,
packs 2.5 / 5 / 10 / 20 kWh, real shape plus the 20 swept shapes, nasa world, "dominates B" as 6zv. Rules as 6zzzj
(experiments/run_offset_sign.py): AT_90 and S(h, d) for h in {0.02, 0.05, 0.10}, d in {-3%, -1.5%, 0, +1.5%, +3%}.
"Five-year mean" is the mean over 2010 to 2014 of the 10-set means.
Checks (must hold or the run is wrong): d = 0 reproduces 6zzzh's hi84 at the nine at k = 3 per year (2010 to 2014)
for AT_90 (18, 0, 44, 0, 76), C02 (26.9, 0.8, 59.9, 2.5, 79.8), C05 (39.7, 10.7, 69.3, 5.0, 78.7) and C10 (50.9,
30.9, 73.6, 6.5, 71.8).

Predictions (priors in brackets), hi84 at the nine, k = 3, five-year means unless stated:
  O1 A forced brightening hurts the wide clamp: C10 at d = +3% < C10 at d = 0 (46.7). [55%]
  O2 C10 - C02 is non-increasing in d over the five shifts (the lead shrinks as d rises; 6zzzj found the opposite).
     [50%]
  O3 The win survives over-cancelling: at d = +3%, C10 > C02. [50%]
  O4 Here the binding constraint is dark hours: summed over the five years, more than half of AT_90's failing hi84
     cells fail on dark hours (alone or with km). [50%]
  O5 The narrow clamp moves less: C02's range over d is smaller than C10's. [80%]
  O6 A darker offset helps the wide clamp here: C10 at d = -3% > C10 at d = 0. [45%]
  O7 As in 6zzzj, the dark share of C10's failures is larger at d = +3% than at d = -3%. [75%]
  O8 The best (h, d) cell is a C10 cell. [55%]
Reading (A) predicts O1, O2 and O6; (K) predicts not-O1, not-O2 and not-O6.

Run (from research/marine-hull): PYTHONPATH=src python3 experiments/run_offset_sign_out.py > experiments/results_offset_sign_out.txt
(stdlib, deterministic; up to 4 processes). --smoke times a handful of keys and prints nothing about results."""
import os
import statistics as st
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import run_offset_sign as osg  # noqa: E402  (its import chain switches to the 2005 to 2014 climatology; configure() undoes it)

oz, fy, oc = osg.oz, osg.fy, osg.oc
lv = oz.lv
NINE, WIDTHS, DS, K, stag, modes = osg.NINE, osg.WIDTHS, osg.DS, osg.K, osg.stag, osg.modes
YEARS = (2010, 2011, 2012, 2013, 2014)
CHECK = {  # 6zzzh, experiments/results_width_new_clim.txt, hi84 at the nine, k = 3, 2010 to 2014
    "AT_90": (18.0, 0.0, 44.0, 0.0, 76.0),
    0.02: (26.9, 0.8, 59.9, 2.5, 79.8),
    0.05: (39.7, 10.7, 69.3, 5.0, 78.7),
    0.10: (50.9, 30.9, 73.6, 6.5, 71.8),
}


def configure():
    """6zzzj's rule set, then 6zzzh's climatology (2015 to 2024); before the worker pool forks."""
    saved = osg.configure()
    oc.use_clim(oc.DEFAULT_CLIM)
    osg.corrections.cache_clear()
    return saved


def restore(saved):
    osg.restore(saved)


def learned_offset(yr):
    """Mean real-shape raw learned month ratio at the nine, pooled over the k = 3 sets."""
    xs = [x for p in NINE for s in oz.SETS[K] for x in lv.raw(p, oz.learn_years(yr, s), oz.ls.REAL)[0]]
    return st.mean(xs)


def main():
    configure()
    assert fy.CLIM_YEARS == tuple(range(2015, 2025))
    oz.load_2025()
    if "--smoke" in sys.argv:
        keys = [(c, p, yr) + oz.ls.REAL for p in NINE[:4] for yr in (2010, 2012) for c in oz.PACKS[:2]]
        t0 = time.time()
        oz.evaluate(keys)
        dt = time.time() - t0
        full = len(NINE) * len(YEARS) * len(oz.PACKS) * len(oz.SHAPES)
        print(f"smoke: {len(keys)} keys in {dt:.1f} s; full run {full} keys, about {dt / len(keys) * full / 60:.0f} min")
        return
    keys = [(c, p, yr) + sh for p in NINE for yr in YEARS for sh in oz.SHAPES for c in oz.PACKS]
    t0 = time.time()
    cells = oz.evaluate(keys)
    C = {yr: oz.counts(cells, yr, NINE, NINE) for yr in YEARS}
    for yr in YEARS:
        C[yr]["pp36"] = C[yr].pop("pp120")
    print("Milestone 6zzzk: forced level shift d of the learned month ratios before the clamp, widths +/-2%, +/-5%, "
          "+/-10%, at the nine high-amplitude points; 2015 to 2024 climatology, scored 2010 to 2014, k = 3; 50 W")
    print(f"nine: {', '.join(NINE)}; {len(keys)} scored keys; run {time.time() - t0:.0f} s")

    print("\nChecks against 6zzzh (d = 0, hi84 at the nine, k = 3, 2010 to 2014):")
    ok_all = True
    got = [C[y]["hi84"]["AT_90"] for y in YEARS]
    ok = all(a == b for a, b in zip(got, CHECK["AT_90"]))
    ok_all &= ok
    print("  AT_90: " + " ".join(f"{x:.1f}" for x in got) + f" {'ok' if ok else 'FAIL'}")
    for h in WIDTHS:
        got = [oz.setmean(C[y]["hi84"], stag(h, 0.0), K)[0] for y in YEARS]
        ok = all(abs(a - b) < 0.05 for a, b in zip(got, CHECK[h]))
        ok_all &= ok
        print(f"  C{round(h * 100):02d} d=0: " + " ".join(f"{x:.1f}" for x in got) + f" {'ok' if ok else 'FAIL'}")
    print(f"  {'all checks passed' if ok_all else 'CHECKS FAILED'}")

    print("\nOffsets at the nine (2015 to 2024 climatology, leave-one-out): realised harvest / climatology of the "
          "scored year, and the mean raw learned month ratio (real shape, k = 3 sets pooled)")
    for y in YEARS:
        print(f"  {y}: realised {oz.realised(y, NINE):.4f}  learned {learned_offset(y):.4f}")

    six = {}
    for f in ("hi84", "eq9", "pp36"):
        print(f"\n{f} at the nine: set-mean count per year, width h and shift d; last column the five-year mean")
        print("  " + " " * 16 + "  ".join(f"{y:>6d}" for y in YEARS) + "    mean")
        at = [C[y][f]["AT_90"] for y in YEARS]
        print("  AT_90           " + "  ".join(f"{x:6.1f}" for x in at) + f"  {st.mean(at):6.1f}")
        for h in WIDTHS:
            for d in DS:
                xs = [oz.setmean(C[y][f], stag(h, d), K)[0] for y in YEARS]
                six[(f, h, d)] = st.mean(xs)
                print(f"  h={h:.2f} d={d * 100:+4.1f}% " + "  ".join(f"{x:6.1f}" for x in xs) + f"  {st.mean(xs):6.1f}")
        six[(f, "AT_90")] = st.mean(at)

    print("\nhi84 five-year means, C10 - C02 and C05 - C02 by shift:")
    for d in DS:
        print(f"  d={d * 100:+4.1f}%: C02 {six[('hi84', 0.02, d)]:5.1f}  C05 {six[('hi84', 0.05, d)]:5.1f}  "
              f"C10 {six[('hi84', 0.10, d)]:5.1f}   C10-C02 {six[('hi84', 0.10, d)] - six[('hi84', 0.02, d)]:+6.1f}"
              f"  C05-C02 {six[('hi84', 0.05, d)] - six[('hi84', 0.02, d)]:+6.1f}")

    print("\nhi84 failure modes, summed over the 10 sets and 5 years (km only / dark only / both; of 4,200 cells):")
    M = {}
    for h in WIDTHS:
        for d in DS:
            m = [0, 0, 0]
            for y in YEARS:
                for s in oz.SETS[K]:
                    for i, x in enumerate(modes(cells, y, oz.rname(stag(h, d), s))):
                        m[i] += x
            M[(h, d)] = m
            n = sum(m)
            print(f"  h={h:.2f} d={d * 100:+4.1f}%: {m[0]:4d} / {m[1]:4d} / {m[2]:4d}  failing {n:4d}; "
                  f"dark share {(m[1] + m[2]) / n if n else 0:.3f}")
    m_at = [0, 0, 0]
    for y in YEARS:
        for i, x in enumerate(modes(cells, y, "AT_90")):
            m_at[i] += x
    print(f"  AT_90 (5 years, of 84 per year): {m_at[0]} / {m_at[1]} / {m_at[2]}")

    print("\nTotals over the nine, real shape, 2.5 kWh, lags (1, 2, 3): km and excess dark h, per scored year")
    for y in YEARS:
        t = oz.tot(cells, [(oz.PACKS[0], p, y) + oz.ls.REAL for p in NINE])
        print(f"  {y}: " + "  ".join(f"{g} {t[g][0]:.0f} / {t[g][1]:.0f}" for g in (oz.BASE, "AT_90")))
        for h in WIDTHS:
            print("        " + "  ".join(f"{stag(h, d)} {t[oz.rname(stag(h, d), (1, 2, 3))][0]:.0f} / "
                                         f"{t[oz.rname(stag(h, d), (1, 2, 3))][1]:.0f}" for d in DS))

    hi = {(h, d): six[("hi84", h, d)] for h in WIDTHS for d in DS}
    gap = [hi[(0.10, d)] - hi[(0.02, d)] for d in DS]
    rng = lambda h: max(hi[(h, d)] for d in DS) - min(hi[(h, d)] for d in DS)  # noqa: E731
    ds = lambda m: (m[1] + m[2]) / sum(m) if sum(m) else 0.0  # noqa: E731
    best = max(hi.items(), key=lambda kv: (kv[1], -kv[0][0]))
    print("\nPredictions:")
    res = [
        ("O1 C10 d=+3% < C10 d=0", hi[(0.10, 0.03)] < hi[(0.10, 0.0)],
         f"{hi[(0.10, 0.03)]:.1f} vs {hi[(0.10, 0.0)]:.1f}"),
        ("O2 C10 - C02 non-increasing in d", all(a >= b for a, b in zip(gap, gap[1:])),
         " ".join(f"{x:+.1f}" for x in gap)),
        ("O3 d=+3%: C10 > C02", hi[(0.10, 0.03)] > hi[(0.02, 0.03)],
         f"{hi[(0.10, 0.03)]:.1f} vs {hi[(0.02, 0.03)]:.1f}"),
        ("O4 AT_90 dark share of failures > 0.5", ds(m_at) > 0.5, f"{ds(m_at):.3f} ({m_at[0]}/{m_at[1]}/{m_at[2]})"),
        ("O5 C02 range over d < C10 range", rng(0.02) < rng(0.10), f"{rng(0.02):.1f} vs {rng(0.10):.1f}"),
        ("O6 C10 d=-3% > C10 d=0", hi[(0.10, -0.03)] > hi[(0.10, 0.0)],
         f"{hi[(0.10, -0.03)]:.1f} vs {hi[(0.10, 0.0)]:.1f}"),
        ("O7 C10 dark share larger at d=+3% than d=-3%", ds(M[(0.10, 0.03)]) > ds(M[(0.10, -0.03)]),
         f"{ds(M[(0.10, 0.03)]):.3f} vs {ds(M[(0.10, -0.03)]):.3f}"),
        ("O8 best (h, d) is a C10 cell", best[0][0] == 0.10, f"{stag(*best[0])} {best[1]:.1f}"),
    ]
    for name, ok, detail in res:
        print(f"  {name}: {'held' if ok else 'refuted'} ({detail})")
    print(f"  {sum(ok for _, ok, _ in res)} of {len(res)} held")


if __name__ == "__main__":
    main()
