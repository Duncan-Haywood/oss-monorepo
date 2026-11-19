"""Milestone 6zzzk: does a forced brightening remove the wide clamp's win at the nine in 6zzzh's 2010 to 2014 rows?
6zzzj's forced level shift, moved into the one design where the wide clamp won.

Why: 6zzzj's first "Next". In 6zzzh (2015 to 2024 climatology, scored 2010 to 2014, learning 2005 to 2013, darker
than the climatology: 30-point realised 0.989 to 0.998) the widest clamp won at the nine high-amplitude points (hi84
at k = 3: C10 46.7, C02 34.0, AT_90 27.6). 6zzzj tested the post-hoc reading that the sign of the learned offset
decides this, inside 6zzzi's design (2005 to 2014 climatology, scored 2020 to 2025): there hi84 rose with the shift d
for every width, failures were on km against B in 88% to 100% of cells, so darkening always hurt, and a dark offset
passed through a wide clamp was the worst cell. That cannot explain 6zzzh's win, so the cause is open: either
(A) offset accuracy: in 2010 to 2014 the scored years are themselves dark against the climatology, so the
    dark offset learned from 2005 to 2013 is a correct forecast, and a wide clamp wins by passing a correct
    forecast; on this reading brightening the learned ratios removes the win (C10 falls as d rises), and AT_90's
    failures there are on dark hours (the plain climatology is too bold in a dark year), the opposite of 6zzzj;
(B) scored decade: something about 2010 to 2014 at the nine (the parked points, the B baseline) favours wide
    clamps whatever the offset; on this reading C10 rises with d as in 6zzzj and its lead survives brightening.

Design (fixed here, before the full run): 6zzzh's design (experiments/run_width_new_clim.py: 2015 to 2024
climatology, leave-one-out by year), scored on its OUT years 2010 to 2014 only, at the frozen nine (6zzzi's NINE,
which is the list 6zzzh's high_amp_points() returned), 50 W, packs 2.5 / 5 / 10 / 20 kWh, real shape plus the 20
swept shapes, nasa world, "dominates B" as 6zv; k = 3 only (the 10 lag sets from {1..5}). Rules exactly 6zzzj's:
AT_90 and S(h, d) = learned month ratios times (1 + d), clamped to 1 +/- h, h in {0.02, 0.05, 0.10}, d in {-3%, -1.5%,
0, +1.5%, +3%}. Footings hi84, eq9, pp36 at the nine and hi84 failure modes (km only, dark only, both) as 6zzzj.
Checks (must hold or the run is wrong): d = 0 reproduces 6zzzh's hi84 at the nine, k = 3, 2010 to 2014: AT_90 18, 0,
44, 0, 76; C02 26.9, 0.8, 59.9, 2.5, 79.8; C05 39.7, 10.7, 69.3, 5.0, 78.7; C10 50.9, 30.9, 73.6, 6.5, 71.8.

Predictions (priors in brackets), hi84, k = 3, five-year means of the set means unless stated:
  K1 Brightening removes part of the wide clamp's value: C10 at d = +3% < C10 at d = 0 (46.7). [55%]
  K2 Endpoint direction opposite to 6zzzj (+16.5 there): C10(d = +3%) - C10(d = -3%) < 0. [55%]
  K3 C10 - C02 at d = +3% is below half its d = 0 value (12.7 / 2 = 6.35). [45%]
  K4 C10 is non-increasing in d over the five shifts. [40%]
  K5 Darkening helps the wide clamp: C10 at d = -1.5% > C10 at d = 0. [50%]
  K6 AT_90's failing hi84 cells, summed over the five years, fail on dark hours (alone or with km) in more than half
     of cases (6zzzj at its design: 21 of 213). [55%]
  K7 The best shift for C02 is d <= 0. [55%]
  K8 C10 > C02 at every d (the wide-clamp win survives every shift). [45%]
  K9 eq9 agrees with hi84 on the sign of C10(d = +3%) - C10(d = -3%). [65%]

Run (from research/marine-hull): PYTHONPATH=src python3 experiments/run_offset_sign_out.py > experiments/results_offset_sign_out.txt
(stdlib, deterministic; up to 4 processes). --smoke times a handful of keys and prints nothing about results."""
import os
import statistics as st
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import run_offset_sign as osg  # noqa: E402  (its import chain sets the 2005 to 2014 climatology; configure() resets)

oz, fy, oc, lv = osg.oz, osg.fy, osg.oc, osg.lv
NINE, WIDTHS, DS, K = osg.NINE, osg.WIDTHS, osg.DS, osg.K
stag, shifted, modes, restore = osg.stag, osg.shifted, osg.modes, osg.restore
YEARS = (2010, 2011, 2012, 2013, 2014)
NEW_CLIM = tuple(range(2015, 2025))
CHECK = {  # 6zzzh, experiments/results_width_new_clim.txt, hi84 at the nine, k = 3, 2010 to 2014
    "AT_90": (18.0, 0.0, 44.0, 0.0, 76.0),
    0.02: (26.9, 0.8, 59.9, 2.5, 79.8),
    0.05: (39.7, 10.7, 69.3, 5.0, 78.7),
    0.10: (50.9, 30.9, 73.6, 6.5, 71.8),
}
C10_6ZZZJ_ENDPOINT = 16.5  # 6zzzj, C10 hi84 at d = +3% minus d = -3% (41.9 - 25.4)


def configure():
    """6zzzj's rules (k = 3, S(h, d)), then 6zzzh's climatology (2015 to 2024, leave-one-out by year)."""
    saved = osg.configure()
    oc.use_clim(oc.DEFAULT_CLIM)
    osg.corrections.cache_clear()
    return saved


def main():
    configure()
    assert fy.CLIM_YEARS == NEW_CLIM
    oz.load_2025()
    if "--smoke" in sys.argv:
        keys = [(c, p, yr) + oz.ls.REAL for p in NINE[:4] for yr in (2011, 2014) for c in oz.PACKS[:2]]
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
    print("Milestone 6zzzk: 6zzzj's forced level shift d of the learned month ratios before the clamp, widths +/-2%, "
          "+/-5%, +/-10%, at the nine high-amplitude points; 2015 to 2024 climatology (6zzzh), scored 2010 to 2014, "
          "k = 3; 50 W")
    print(f"nine: {', '.join(NINE)}; {len(keys)} scored keys; run {time.time() - t0:.0f} s")

    print("\nChecks against 6zzzh (d = 0, hi84 at the nine, k = 3):")
    ok_all = True
    for y, v in zip(YEARS, CHECK["AT_90"]):
        ok = C[y]["hi84"]["AT_90"] == v
        ok_all &= ok
        print(f"  {y} AT_90 {C[y]['hi84']['AT_90']:.1f} (6zzzh {v:.1f}) {'ok' if ok else 'FAIL'}")
    for h in WIDTHS:
        got = [oz.setmean(C[y]["hi84"], stag(h, 0.0), K)[0] for y in YEARS]
        ok = all(abs(a - b) < 0.05 for a, b in zip(got, CHECK[h]))
        ok_all &= ok
        print(f"  C{round(h * 100):02d} d=0: " + " ".join(f"{x:.1f}" for x in got) + f" {'ok' if ok else 'FAIL'}")
    print(f"  {'all checks passed' if ok_all else 'CHECKS FAILED'}")

    print("\nRealised harvest / climatology (2015 to 2024, leave-one-out), mean over the nine, scored year and the "
          "mean of its five learning years 2005 to 2013:")
    for y in YEARS:
        ly = sorted({y - g for g in range(1, 6)})
        print(f"  {y}: scored {oz.realised(y, NINE):.4f}; learning years ({ly[0]} to {ly[-1]}) "
              f"{st.mean(oz.realised(x, NINE) for x in ly):.4f}")

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

    print("\nhi84 failure modes, summed over the 10 sets and 5 years (km only / dark only / both; of 4200 cells):")
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
    at_m = [0, 0, 0]
    for y in YEARS:
        print(f"  AT_90 {y}: " + " / ".join(str(x) for x in modes(cells, y, "AT_90")))
        for i, x in enumerate(modes(cells, y, "AT_90")):
            at_m[i] += x
    print(f"  AT_90 (5 years, of 84 per year): {at_m[0]} / {at_m[1]} / {at_m[2]}")

    print("\nTotals over the nine, real shape, 2.5 kWh, lags (1, 2, 3): km and excess dark h, per year")
    for y in YEARS:
        t = oz.tot(cells, [(oz.PACKS[0], p, y) + oz.ls.REAL for p in NINE])
        print(f"  {y}: " + "  ".join(f"{g} {t[g][0]:.0f} / {t[g][1]:.0f}" for g in (oz.BASE, "AT_90")))
        for h in WIDTHS:
            print("        " + "  ".join(f"{stag(h, d)} {t[oz.rname(stag(h, d), (1, 2, 3))][0]:.0f} / "
                                     f"{t[oz.rname(stag(h, d), (1, 2, 3))][1]:.0f}" for d in DS))

    hi = {(h, d): six[("hi84", h, d)] for h in WIDTHS for d in DS}
    eq = {(h, d): six[("eq9", h, d)] for h in WIDTHS for d in DS}
    c10 = [hi[(0.10, d)] for d in DS]
    end_hi = hi[(0.10, 0.03)] - hi[(0.10, -0.03)]
    end_eq = eq[(0.10, 0.03)] - eq[(0.10, -0.03)]
    gap0, gap3 = hi[(0.10, 0.0)] - hi[(0.02, 0.0)], hi[(0.10, 0.03)] - hi[(0.02, 0.03)]
    c02_best = max(DS, key=lambda d: (hi[(0.02, d)], -d))
    at_dark = (at_m[1] + at_m[2]) / sum(at_m) if sum(at_m) else 0.0
    print("\nPredictions:")
    res = [
        ("K1 C10 d=+3% < C10 d=0", hi[(0.10, 0.03)] < hi[(0.10, 0.0)],
         f"{hi[(0.10, 0.03)]:.1f} vs {hi[(0.10, 0.0)]:.1f}"),
        ("K2 C10(+3%) - C10(-3%) < 0 (6zzzj +16.5)", end_hi < 0, f"{end_hi:+.1f}"),
        ("K3 C10 - C02 at d=+3% < 6.35", gap3 < 6.35, f"{gap3:+.1f} (d=0 {gap0:+.1f})"),
        ("K4 C10 non-increasing in d", all(a >= b for a, b in zip(c10, c10[1:])), " ".join(f"{x:.1f}" for x in c10)),
        ("K5 C10 d=-1.5% > C10 d=0", hi[(0.10, -0.015)] > hi[(0.10, 0.0)],
         f"{hi[(0.10, -0.015)]:.1f} vs {hi[(0.10, 0.0)]:.1f}"),
        ("K6 AT_90 dark share of failing cells > 0.5", at_dark > 0.5,
         f"{at_dark:.3f} ({at_m[1] + at_m[2]} of {sum(at_m)})"),
        ("K7 best d for C02 <= 0", c02_best <= 0, f"best d {c02_best * 100:+.1f}% ({hi[(0.02, c02_best)]:.1f})"),
        ("K8 C10 > C02 at every d", all(hi[(0.10, d)] > hi[(0.02, d)] for d in DS),
         " ".join(f"{hi[(0.10, d)] - hi[(0.02, d)]:+.1f}" for d in DS)),
        ("K9 eq9 agrees on the sign of C10(+3%) - C10(-3%)", (end_eq > 0) == (end_hi > 0) and end_eq != 0,
         f"eq9 {end_eq:+.1f}, hi84 {end_hi:+.1f}"),
    ]
    for name, ok, detail in res:
        print(f"  {name}: {'held' if ok else 'refuted'} ({detail})")
    print(f"  {sum(ok for _, ok, _ in res)} of {len(res)} held")


if __name__ == "__main__":
    main()
