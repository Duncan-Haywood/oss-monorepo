"""Milestone 6zzzj: does the sign of the learned offset decide whether a wide clamp wins at the nine high-amplitude
points? A forced level-shift test of 6zzzi's post-hoc reading.

Why: 6zzzi's first "Next". At the nine high-amplitude points (frozen list of 6zz) two designs whose learning years
lie outside the climatology gave opposite width curves. In 6zzzh (2015 to 2024 climatology, scored 2010 to 2014,
learning 2005 to 2013, darker than the climatology) C10 beat C02 at k = 3 on hi84 (46.7 against 34.0); in 6zzzi (2005
to 2014 climatology, scored 2020 to 2025, learning 2015 to 2024, realised 1.015 brighter) C10 lost to C02 (36.6
against 48.5). Post-hoc reading (S): a dark learned offset makes the boat cautious, which at mostly parked
high-latitude points rarely costs distance against B, so a wide clamp that passes it is safe or helps; a bright
offset makes the boat bold, which spends dark hours, so a wide clamp that passes it loses. A forced shift tests (S)
inside one design, with the scored years, the climatology and the noise held fixed: multiply every learned month
ratio by (1 + d) before the clamp, so the offset changes by d and a narrow clamp cuts most of it while a wide one
passes it.

Design (fixed here, before the full run): 6zzzi's design unchanged (experiments/run_width_hi9.py: 2005 to 2014
climatology, scored 2020 to 2025, the nine points, 50 W, packs 2.5 / 5 / 10 / 20 kWh, real shape plus the 20 swept
shapes, nasa world, "dominates B" as 6zv), k = 3 only (the 10 lag sets from {1..5}). Rules: AT_90 (no correction) and
S(h, d) = the raw learned month ratios times (1 + d), then clamped to 1 +/- h, for h in {0.02, 0.05, 0.10} and d in
{-3%, -1.5%, 0, +1.5%, +3%}. d = 0 is 6zzzi's C02 / C05 / C10. The realised offset at the nine is +1.5% (6zzzi), so
d = -1.5% roughly cancels it and d = -3% turns it to a dark offset of about the same size.
Checks (must hold or the run is wrong): d = 0 reproduces 6zzzi's hi84 at k = 3 per year for C02 (55.4, 18.8, 42.3,
41.2, 51.3, 81.9), C05 (51.5, 12.2, 30.8, 40.5, 45.7, 83.9) and C10 (39.1, 9.0, 21.5, 35.4, 31.8, 82.9); AT_90 55,
19, 48, 44, 50, 75.
Footings at the nine as 6zzzi (hi84, eq9, pp36). Failure modes: for every hi84 cell (shape x pack, summed over the
nine) a rule fails to dominate B on km only, dark only or both; counted per rule, summed over sets and years.

Predictions (priors in brackets), hi84, k = 3, six-year means of the set means unless stated:
  S1 C10's gap to C02 (C10 - C02) rises as d falls: non-increasing in d over the five shifts. [65%]
  S2 With a dark offset the wide clamp wins: at d = -3%, C10 > C02. [45%]
  S3 With the offset cancelled the curve is flatter than 6zzzi's: at d = -1.5%, C02 - C10 < 11.9 / 2. [55%]
  S4 A brighter offset hurts the wide clamp more: C10 at d = +3% < C10 at d = 0 (36.6). [75%]
  S5 The narrow clamp is insensitive: C02's six-year mean at every d is within 3 of its d = 0 value (48.5). [60%]
  S6 Darkening helps the wide clamp: C10 at d = -1.5% > C10 at d = 0. [70%]
  S7 Failure mode follows the sign: summed over C10's sets and years, the share of failing hi84 cells that fail on
     dark hours (alone or with km) is larger at d = +3% than at d = -3%. [80%]
  S8 At d = -3% the share of C10's failing hi84 cells that fail on km only is above one half. [60%]
  S9 Some shift beats no correction: the best (h, d) six-year mean exceeds AT_90 (48.5) by at least 2. [40%]

Run (from research/marine-hull): PYTHONPATH=src python3 experiments/run_offset_sign.py > experiments/results_offset_sign.txt
(stdlib, deterministic; up to 4 processes). --smoke times a handful of keys and prints nothing about results."""
import os
import statistics as st
import sys
import time
from functools import lru_cache

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import run_width_hi9 as wh  # noqa: E402  (sets fy.CLIM_YEARS to 2005 to 2014 on import)

oz, fy, oc, wo = wh.oz, wh.fy, wh.oc, wh.wo
lv = oz.lv
NINE, YEARS, OOS = wh.NINE, wh.YEARS, wh.OOS
WIDTHS = (0.02, 0.05, 0.10)
DS = (-0.03, -0.015, 0.0, 0.015, 0.03)
K = 3
CHECK = {  # 6zzzi, experiments/results_width_hi9.txt, hi84 at the nine, k = 3
    "AT_90": (55.0, 19.0, 48.0, 44.0, 50.0, 75.0),
    0.02: (55.4, 18.8, 42.3, 41.2, 51.3, 81.9),
    0.05: (51.5, 12.2, 30.8, 40.5, 45.7, 83.9),
    0.10: (39.1, 9.0, 21.5, 35.4, 31.8, 82.9),
}


def stag(h, d):
    """Rule tag for width h and shift d, e.g. C10m30 (d = -3%), C02p15, C05z00."""
    sign = "m" if d < 0 else ("p" if d > 0 else "z")
    return f"C{round(h * 100):02d}{sign}{round(abs(d) * 1000):02d}"


TAG_ORDER = tuple(stag(h, d) for h in WIDTHS for d in DS)


def shifted(r, h, d):
    """Learned month ratios times (1 + d), clamped to 1 +/- h."""
    return tuple(lv.clamp(x * (1 + d), (1 - h, 1 + h)) for x in r)


@lru_cache(maxsize=64)
def corrections(p, yr, shape):
    out = {}
    for s in oz.SETS[K]:
        r = lv.raw(p, oz.learn_years(yr, s), shape)[0]
        for h in WIDTHS:
            for d in DS:
                out[oz.rname(stag(h, d), s)] = shifted(r, h, d)
    return out


_NAMES = ("KS", "TAGS", "TAG_ORDER", "RULES", "corrections")


def configure():
    """6zzzg's configure() (climatology, packs), then this step's rules; before the worker pool forks."""
    oc.use_clim(oc.OLD_CLIM)
    saved = wo.configure()
    saved.update({n: getattr(oz, n) for n in _NAMES if n not in saved})
    corrections.cache_clear()
    oz.corrections = corrections
    oz.KS = (K,)
    oz.TAGS = {K: TAG_ORDER}
    oz.TAG_ORDER = TAG_ORDER
    oz.RULES = ("AT_90",) + tuple(oz.rname(t, s) for t in TAG_ORDER for s in oz.SETS[K])
    return saved


def restore(saved):
    wo.restore(saved)


def modes(cells, yr, g):
    """(km only, dark only, both) failing hi84 cells of rule g in year yr, summed over the nine."""
    out = [0, 0, 0]
    for sh in oz.SHAPES:
        for c in oz.PACKS:
            t = oz.tot(cells, [(c, p, yr) + sh for p in NINE])
            km_bad = t[g][0] < t[oz.BASE][0]
            dk_bad = t[g][1] > t[oz.BASE][1]
            if km_bad and dk_bad:
                out[2] += 1
            elif km_bad:
                out[0] += 1
            elif dk_bad:
                out[1] += 1
    return out


def main():
    configure()
    assert fy.CLIM_YEARS == oc.OLD_CLIM
    oz.load_2025()
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
    C = {yr: oz.counts(cells, yr, NINE, NINE) for yr in YEARS}
    for yr in YEARS:
        C[yr]["pp36"] = C[yr].pop("pp120")
    print("Milestone 6zzzj: forced level shift d of the learned month ratios before the clamp, widths +/-2%, +/-5%, "
          "+/-10%, at the nine high-amplitude points; 2005 to 2014 climatology, scored 2020 to 2025, k = 3; 50 W")
    print(f"nine: {', '.join(NINE)}; {len(keys)} scored keys; run {time.time() - t0:.0f} s")

    print("\nChecks against 6zzzi (d = 0, hi84 at the nine, k = 3):")
    ok_all = True
    for y, v in zip(YEARS, CHECK["AT_90"]):
        ok = C[y]["hi84"]["AT_90"] == v
        ok_all &= ok
        print(f"  {y} AT_90 {C[y]['hi84']['AT_90']:.1f} (6zzzi {v:.1f}) {'ok' if ok else 'FAIL'}")
    for h in WIDTHS:
        got = [oz.setmean(C[y]["hi84"], stag(h, 0.0), K)[0] for y in YEARS]
        ok = all(abs(a - b) < 0.05 for a, b in zip(got, CHECK[h]))
        ok_all &= ok
        print(f"  C{round(h * 100):02d} d=0: " + " ".join(f"{x:.1f}" for x in got) + f" {'ok' if ok else 'FAIL'}")
    print(f"  {'all checks passed' if ok_all else 'CHECKS FAILED'}")

    six = {}
    for f in ("hi84", "eq9", "pp36"):
        print(f"\n{f} at the nine: set-mean count per year, width h and shift d; last column the six-year mean")
        print("  " + " " * 16 + "  ".join(f"{y:>6d}" for y in YEARS) + "    mean")
        at = [C[y][f]["AT_90"] for y in YEARS]
        print("  AT_90           " + "  ".join(f"{x:6.1f}" for x in at) + f"  {st.mean(at):6.1f}")
        for h in WIDTHS:
            for d in DS:
                xs = [oz.setmean(C[y][f], stag(h, d), K)[0] for y in YEARS]
                six[(f, h, d)] = st.mean(xs)
                print(f"  h={h:.2f} d={d * 100:+4.1f}% " + "  ".join(f"{x:6.1f}" for x in xs) + f"  {st.mean(xs):6.1f}")
        six[(f, "AT_90")] = st.mean(at)

    print("\nhi84 six-year means, C10 - C02 and C05 - C02 by shift:")
    for d in DS:
        print(f"  d={d * 100:+4.1f}%: C02 {six[('hi84', 0.02, d)]:5.1f}  C05 {six[('hi84', 0.05, d)]:5.1f}  "
              f"C10 {six[('hi84', 0.10, d)]:5.1f}   C10-C02 {six[('hi84', 0.10, d)] - six[('hi84', 0.02, d)]:+6.1f}"
              f"  C05-C02 {six[('hi84', 0.05, d)] - six[('hi84', 0.02, d)]:+6.1f}")

    print("\nhi84 failure modes, summed over the 10 sets and 6 years (km only / dark only / both; of 840 cells):")
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
    m = [0, 0, 0]
    for y in YEARS:
        for i, x in enumerate(modes(cells, y, "AT_90")):
            m[i] += x
    print(f"  AT_90 (6 years, of 84 per year): {m[0]} / {m[1]} / {m[2]}")

    print("\nTotals over the nine, real shape, 2025, 2.5 kWh, lags (1, 2, 3): km and excess dark h")
    t = oz.tot(cells, [(oz.PACKS[0], p, OOS) + oz.ls.REAL for p in NINE])
    print("  " + "  ".join(f"{g} {t[g][0]:.0f} / {t[g][1]:.0f}" for g in (oz.BASE, "AT_90")))
    for h in WIDTHS:
        print("  " + "  ".join(f"{stag(h, d)} {t[oz.rname(stag(h, d), (1, 2, 3))][0]:.0f} / "
                               f"{t[oz.rname(stag(h, d), (1, 2, 3))][1]:.0f}" for d in DS))

    hi = {(h, d): six[("hi84", h, d)] for h in WIDTHS for d in DS}
    gap = [hi[(0.10, d)] - hi[(0.02, d)] for d in DS]
    ds = lambda m: (m[1] + m[2]) / sum(m) if sum(m) else 0.0  # noqa: E731
    best = max(hi.items(), key=lambda kv: (kv[1], -kv[0][0]))
    at6 = six[("hi84", "AT_90")]
    print("\nPredictions:")
    res = [
        ("S1 C10 - C02 non-increasing in d", all(a >= b for a, b in zip(gap, gap[1:])),
         " ".join(f"{x:+.1f}" for x in gap)),
        ("S2 d=-3%: C10 > C02", hi[(0.10, -0.03)] > hi[(0.02, -0.03)],
         f"{hi[(0.10, -0.03)]:.1f} vs {hi[(0.02, -0.03)]:.1f}"),
        ("S3 d=-1.5%: C02 - C10 < 5.95", hi[(0.02, -0.015)] - hi[(0.10, -0.015)] < 5.95,
         f"{hi[(0.02, -0.015)] - hi[(0.10, -0.015)]:.1f}"),
        ("S4 C10 d=+3% < C10 d=0", hi[(0.10, 0.03)] < hi[(0.10, 0.0)],
         f"{hi[(0.10, 0.03)]:.1f} vs {hi[(0.10, 0.0)]:.1f}"),
        ("S5 C02 within 3 of its d=0 value at every d", all(abs(hi[(0.02, d)] - hi[(0.02, 0.0)]) <= 3 for d in DS),
         " ".join(f"{hi[(0.02, d)]:.1f}" for d in DS)),
        ("S6 C10 d=-1.5% > C10 d=0", hi[(0.10, -0.015)] > hi[(0.10, 0.0)],
         f"{hi[(0.10, -0.015)]:.1f} vs {hi[(0.10, 0.0)]:.1f}"),
        ("S7 C10 dark share of failures larger at d=+3% than d=-3%", ds(M[(0.10, 0.03)]) > ds(M[(0.10, -0.03)]),
         f"{ds(M[(0.10, 0.03)]):.3f} vs {ds(M[(0.10, -0.03)]):.3f}"),
        ("S8 C10 d=-3% km-only share of failures > 0.5",
         M[(0.10, -0.03)][0] / max(1, sum(M[(0.10, -0.03)])) > 0.5,
         f"{M[(0.10, -0.03)][0] / max(1, sum(M[(0.10, -0.03)])):.3f}"),
        ("S9 best (h, d) >= AT_90 + 2", best[1] >= at6 + 2,
         f"{stag(*best[0])} {best[1]:.1f} vs AT_90 {at6:.1f}"),
    ]
    for name, ok, detail in res:
        print(f"  {name}: {'held' if ok else 'refuted'} ({detail})")
    print(f"  {sum(ok for _, ok, _ in res)} of {len(res)} held")


if __name__ == "__main__":
    main()
