"""Milestone 7u: glider against AUV as a curve in the AUV/glider hotel-load ratio (the paper's third figure).

Run: PYTHONPATH=src:experiments python3 experiments/run_glider_hotel_curve.py > experiments/results_glider_hotel_curve.txt
Cases: the 2,430 milestone-4b cases of run_slocum.py (gliderflight Slocum coefficients), code unchanged.
For each multiple x the AUV's hotel load is x times the glider's; with equal battery the range ratio
glider/AUV equals AUV J/m over glider J/m. The REMUS-100 band uses run_remus.py's implied hotel loads.

Expectations committed before the run (LOG.md, milestone 7u):
E1 share passes 10/50/90% near x = 2.38/4.87/10.67 (one grid step) and gives 0.0/51.6/99.9% at x = 1/5/20;
E2 median ratio monotone, crosses 1 between x = 4 and 6;
E3 median ratio's log-log slope over x = 20 to 200 in 0.60 to 0.70;
E4 the REMUS band lies wholly where the glider wins every case.
"""
import itertools
import math
from functools import lru_cache
from run_slocum import GRID, glider_best, auv_best
import run_remus
from run_slocum import SPEEDS, VOL
from marine_hull.glider import auv_energy_per_m

WIDE = [0.1 + 0.025 * i for i in range(157)]   # post hoc: 0.1 to 4.0 m/s, same step

XS = [10.0 ** (i / 12.0) for i in range(-12, 37)]   # 0.1 to 1000, 12 per decade
XS = sorted(set(XS) | {1.0, 5.0, 20.0, 200.0})


def q(xs, p):
    return sorted(xs)[int(p * (len(xs) - 1))]


@lru_cache(maxsize=None)
def auv_cached(auv, hotel):
    return auv_best(auv, hotel)


def cases():
    keys = list(GRID)
    out = []
    for vals in itertools.product(*(GRID[k] for k in keys)):
        c = dict(zip(keys, vals))
        e_g = glider_best(c['cd0'], c['b_max'], c['eta_pump'], c['e_cycle'], c['hotel'])[0]
        out.append((e_g, c['auv'], c['hotel']))
    return out


@lru_cache(maxsize=None)
def auv_wide(auv, hotel):
    length, c_s, kf = auv
    return min((auv_energy_per_m(v, length, VOL, c_s, kf, hotel), v) for v in WIDE)


def curve(cs, xs=XS, wide=False):
    rows = []
    for x in xs:
        if wide:
            r = [auv_wide(auv, h * x)[0] / e_g for e_g, auv, h in cs]
        else:
            r = [auv_cached(auv, h * x) / e_g for e_g, auv, h in cs]
        rows.append((x, sum(v > 1.0 for v in r) / len(r), q(r, .1), q(r, .5), q(r, .9)))
    return rows


def remus_band():
    hs = []
    for k, eta, pt in itertools.product(run_remus.FORM, run_remus.ETA, run_remus.P_TOTAL):
        hs.append(pt - run_remus.prop_w(k, eta))
    gh = GRID['hotel']
    return min(hs) / max(gh), max(hs) / min(gh)


def crossing(rows, col, level):
    """Log-interpolated x at which column col first reaches level."""
    for (x0, *a), (x1, *b) in zip(rows, rows[1:]):
        y0, y1 = a[col], b[col]
        if y0 < level <= y1:
            t = (level - y0) / (y1 - y0)
            return 10 ** (math.log10(x0) + t * (math.log10(x1) - math.log10(x0)))
    return None


def main():
    cs = cases()
    rows = curve(cs)
    print(f"cases {len(cs)} (milestone-4b grid); x = AUV hotel / glider hotel, {len(rows)} values 0.1 to 1000")
    print("x\tshare_glider_longer\tratio_p10\tratio_p50\tratio_p90")
    for x, s, a, b, c in rows:
        print(f"{x:.4g}\t{s:.4f}\t{a:.4f}\t{b:.4f}\t{c:.4f}")
    for lv in (0.1, 0.5, 0.9):
        print(f"share reaches {lv:.0%} at x = {crossing(rows, 0, lv):.2f} (log-interpolated)")
    print(f"median ratio reaches 1 at x = {crossing(rows, 2, 1.0):.2f} (log-interpolated)")
    med = {round(x, 6): b for x, _, _, b, _ in rows}
    mono = all(r1[3] >= r0[3] for r0, r1 in zip(rows, rows[1:]))
    print(f"median ratio monotone in x: {mono}")
    sl = math.log(med[200.0] / med[20.0]) / math.log(10.0)
    print(f"median ratio log-log slope x 20 to 200: {sl:.3f}")
    print(f"median ratio at x 0.1 (AUV nearly hotel-free): {rows[0][3]:.3f}")
    lo, hi = remus_band()
    inside = [r for r in rows if lo <= r[0] <= hi]
    print(f"REMUS-100 band (implied hotel / glider hotel): x {lo:.1f} to {hi:.1f}; "
          f"min share in band {min(r[1] for r in inside):.4f}; share at band floor "
          f"{curve(cs, [lo])[0][1]:.4f}")
    print("POST HOC (added after E3 failed, not pre-registered): is the 4b AUV speed grid's 1.5 m/s ceiling binding?")
    for x in (1.0, 5.0, 20.0, 200.0):
        cap = sum(auv_wide(auv, h * x)[1] > SPEEDS[-1] + 1e-9 for _, auv, h in cs) / len(cs)
        print(f"x {x:g}: AUV unconstrained best speed above 1.5 m/s in {cap:.1%} of cases")
    wrows = curve(cs, wide=True)
    wmed = {round(x, 6): b for x, _, _, b, _ in wrows}
    print(f"speeds to 4.0 m/s: share reaches 10/50/90% at x = "
          + ", ".join(f"{crossing(wrows, 0, lv):.2f}" for lv in (0.1, 0.5, 0.9))
          + f"; median ratio 1 at x = {crossing(wrows, 2, 1.0):.2f}")
    print(f"speeds to 4.0 m/s: median ratio log-log slope x 1 to 10 {math.log10(wmed[10.0] / wmed[1.0]):.3f}, "
          f"x 20 to 200 {math.log10(wmed[200.0] / wmed[20.0]):.3f}; capped grid x 1 to 10 {math.log10(med[10.0] / med[1.0]):.3f}")
    for x, sh, a, b, c in wrows:
        print(f"wide\t{x:.4g}\t{sh:.4f}\t{a:.4f}\t{b:.4f}\t{c:.4f}")
    print(f"speeds to 4.0 m/s: min share in REMUS band {min(r[1] for r in wrows if lo <= r[0] <= hi):.4f}")


if __name__ == "__main__":
    main()
