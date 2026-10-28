"""Milestone 5 (planing rung): can a planing hull out-range the displacement monohull at 200 kg, 25% battery?

    PYTHONPATH=src python3 experiments/run_planing.py > experiments/results_planing.txt

Planing: Savitsky (1964) prismatic hull, best trim 2 to 15 deg (marine_hull.planing), speeds with Cv 1 to 25.
Monohull: milestone 2's Wigley/Michell model, 4 m, k = 0.25, scale 1. Same battery, hotel load (30 W) and
propulsive efficiencies as milestones 1 and 2.
"""
import itertools
from marine_hull.planing import best_trim_drag
from marine_hull.hull import range_km
import run_michell as rm

SPEEDS = [i / 4.0 for i in range(4, 81)]  # 1 to 20 m/s


def plane_best(beam, beta, wh):
    top = (0.0, 0.0, 0.0)
    for v in SPEEDS:
        r = best_trim_drag(v, rm.M, beam, beta)
        if r is None:
            continue
        km = range_km(wh, v, r[0], p_hotel=rm.HOTEL)
        if km > top[0]:
            top = (km, v, r[2])
    return top


if __name__ == "__main__":
    AX = dict(beam=[0.5, 0.7, 0.9, 1.1], beta=[0.0, 10.0, 20.0, 30.0], e_batt=[150.0, 200.0, 250.0])
    cache = {}
    rows = []
    for beam, beta, eb in itertools.product(*AX.values()):
        wh = rm.M * rm.FB * eb
        p = plane_best(beam, beta, wh)
        m = rm.best(4.0, 1, 0.0, 0.25, 0.0, 1.0, eb, cache)
        rows.append((beam, beta, eb, p, m))
    n = len(rows)
    ok = [r for r in rows if r[3][0] > 0]
    win = [r for r in ok if r[3][0] > r[4][0]]
    print(f"cases {n}; planing feasible in {len(ok)}; planing out-ranges monohull in {len(win)} ({100*len(win)/n:.2f}%)")
    rat = sorted(r[3][0] / r[4][0] for r in ok)
    print(f"range ratio planing/mono (feasible): min {rat[0]:.3f} median {rat[len(rat)//2]:.3f} max {rat[-1]:.3f}")
    pr = sorted(r[3][0] for r in ok)
    print(f"planing best range km: min {pr[0]:.0f} median {pr[len(pr)//2]:.0f} max {pr[-1]:.0f}; monohull median {sorted(r[4][0] for r in rows)[n//2]:.0f}")
    print(f"planing best speed m/s: median {sorted(r[3][1] for r in ok)[len(ok)//2]:.2f}; trim deg median {sorted(r[3][2] for r in ok)[len(ok)//2]:.0f}")
    b = max(ok, key=lambda r: r[3][0] / r[4][0])
    print("best planing/mono case:", dict(zip(list(AX), b[:3])), f"planing {b[3][0]:.0f} km at {b[3][1]:.2f} m/s trim {b[3][2]:.0f}; mono {b[4][0]:.0f} km")
    print(f"planing best speed at the 20 m/s grid ceiling in {sum(1 for r in ok if r[3][1] == SPEEDS[-1])} of {len(ok)}; at the Cv=1 lower edge (v = sqrt(g b)) region: see min speed {min(r[3][1] for r in ok):.2f} m/s")
