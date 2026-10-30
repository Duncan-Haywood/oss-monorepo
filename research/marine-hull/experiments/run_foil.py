"""Milestone 5: does a foilborne craft out-range the displacement monohull at 200 kg, 25% battery?

    PYTHONPATH=src python3 experiments/run_foil.py > experiments/results_foil.txt

Foil: lifting-line + flat-plate struts (marine_hull.foil). Foilborne speed must satisfy CL <= CL_max
(takeoff) and CL >= 0.05. Monohull: milestone 2's Wigley/Michell model, 4 m, k = 0.25, scale 1.
Same battery, hotel load (30 W) and propulsive efficiencies as milestones 1 and 2.
"""
import itertools
from marine_hull.foil import foil_drag
from marine_hull.hull import power_total, range_km
import run_michell as rm

SPEEDS = [i / 4.0 for i in range(4, 41)]  # 1 to 10 m/s


def foil_best(area, ar, e, cd0, draft, extra, clmax, wh):
    top = (0.0, 0.0)
    for v in SPEEDS:
        d, cl = foil_drag(v, rm.M, area, ar, e=e, cd0=cd0, strut_draft=draft, extra=extra)
        if cl > clmax or cl < 0.05:
            continue
        km = range_km(wh, v, d, p_hotel=rm.HOTEL)
        if km > top[0]:
            top = (km, v)
    return top


if __name__ == "__main__":
    AX = dict(area=[0.02, 0.04, 0.08], ar=[6.0, 10.0, 14.0], e=[0.8, 0.95], cd0=[0.008, 0.012, 0.02],
              draft=[0.3, 0.5], extra=[1.0, 1.15, 1.4], clmax=[0.8, 1.2, 1.6], e_batt=[150.0, 200.0, 250.0])
    cache = {}
    rows = []
    for area, ar, e, cd0, draft, extra, clmax, eb in itertools.product(*AX.values()):
        wh = rm.M * rm.FB * eb
        f = foil_best(area, ar, e, cd0, draft, extra, clmax, wh)
        m = rm.best(4.0, 1, 0.0, 0.25, 0.0, 1.0, eb, cache)
        rows.append((area, ar, e, cd0, draft, extra, clmax, eb, f, m))
    n = len(rows)
    ok = [r for r in rows if r[8][0] > 0]
    win = [r for r in ok if r[8][0] > r[9][0]]
    print(f"cases {n}; foilborne flight feasible in {len(ok)}; foil out-ranges monohull in {len(win)} ({100*len(win)/n:.2f}%)")
    rat = sorted(r[8][0] / r[9][0] for r in ok)
    print(f"range ratio foil/mono (feasible): min {rat[0]:.3f} median {rat[len(rat)//2]:.3f} max {rat[-1]:.3f}")
    fr = sorted(r[8][0] for r in ok)
    print(f"foil best range km: min {fr[0]:.0f} median {fr[len(fr)//2]:.0f} max {fr[-1]:.0f}; monohull median {sorted(r[9][0] for r in rows)[n//2]:.0f}")
    print(f"foil best speed m/s: median {sorted(r[8][1] for r in ok)[len(ok)//2]:.2f}")
    # best-case corner
    b = max(ok, key=lambda r: r[8][0] / r[9][0])
    print("best foil/mono case:", dict(zip(list(AX), b[:8])), f"foil {b[8][0]:.0f} km at {b[8][1]:.2f} m/s; mono {b[9][0]:.0f} km")
    top = sum(1 for r in ok if r[8][1] == SPEEDS[-1])
    print(f"foil best speed at the 10 m/s grid ceiling in {top} of {len(ok)} feasible cases")
