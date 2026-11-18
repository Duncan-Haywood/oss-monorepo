"""Milestone 7t: range against speed, one curve per rung, for the paper's Fig. 2.

    PYTHONPATH=src:experiments python3 experiments/run_range_speed.py > experiments/results_range_speed.txt

Not a new sweep. Each rung's resistance model is the one its own milestone used (run_michell,
run_swath, run_planing, run_foil), evaluated at the centre of that milestone's swept box, so the
figure shows *why* Table I comes out as it does: where each curve peaks and how far apart the peaks
are. Common basis as everywhere in the programme: 200 kg, 25% battery at 200 Wh/kg (10 kWh), 30 W
hotel load, eta_prop 0.55 x eta_motor 0.85.

Central cases (the middle value of each axis in its own milestone; where an axis has an even count,
the value named below):
  monohull   4 m Wigley, L/B 10, k 0.25, Michell wave scale 1                     (run_michell)
  catamaran  2 x 4 m Wigley demi-hulls, L/B 14, s/L 0.25, k 0.25, interference 0.15 (run_michell)
  SWATH      4 m torpedoes, axis depth 0.6 m, s/L 0.25, strut chord 0.5 L, k 0.10   (run_swath)
  planing    Savitsky prismatic, beam 0.7 m, deadrise 10 deg, best trim             (run_planing)
  hydrofoil  area 0.04 m2, AR 10, e 0.95, cd0 0.012, strut draft 0.3 m, extra 1.15,
             CL_max 1.2 (foilborne only where 0.05 <= CL <= CL_max)                 (run_foil)
Panel (b): the monohull curve at hotel loads 5, 15, 30, 60 and 120 W, to show that the best-range
speed is set by the hotel load (paper section 2: propulsive share about one third at the optimum).

Expectations written before the first run (a figure step, not a hypothesis test): the peaks fall in
Table I's order (monohull > catamaran > SWATH > hydrofoil > planing); every displacement peak sits
between 0.8 and 1.5 m/s; in panel (b) the best speed rises with hotel load, roughly as P_hotel^(1/3).
"""
import math
import sys

from marine_hull.foil import foil_drag
from marine_hull.hull import cf_ittc57, range_km, RHO_SEA, NU_SEA
from marine_hull.planing import best_trim_drag
import run_michell as rm
import run_swath as rs

WH = rm.M * rm.FB * 200.0
DISP = [i / 20.0 for i in range(6, 121)]        # 0.30 to 6.00 m/s
FAST = [i / 4.0 for i in range(4, 81)]          # 1 to 20 m/s
HOTELS = [5.0, 15.0, 30.0, 60.0, 120.0]


def michell_r(length, n, sep, k, interf, speeds):
    l, b, t, s = rm.hull(length, n)
    out = []
    for u in speeds:
        rw = rm.wave_resistance_wigley(u, l, b, t, n_hulls=n, sep=sep * l)
        rv = n * 0.5 * RHO_SEA * u * u * s * (1 + k + interf) * cf_ittc57(u * length / NU_SEA)
        out.append(rv + rw)
    return out


def swath_r(speeds):
    old, rs.SPEEDS = rs.SPEEDS, speeds
    try:
        tab, _, _ = rs.swath_tables(4.0, 0.6, 0.25, 0.5)
    finally:
        rs.SPEEDS = old
    return [rs.swath_r(row, 0.10, 1.0) for row in tab]


def planing_r(speeds):
    out = []
    for v in speeds:
        r = best_trim_drag(v, rm.M, 0.7, 10.0)
        out.append(None if r is None else r[0])
    return out


def foil_r(speeds):
    out = []
    for v in speeds:
        d, cl = foil_drag(v, rm.M, 0.04, 10.0, e=0.95, cd0=0.012, strut_draft=0.3, extra=1.15)
        out.append(d if 0.05 <= cl <= 1.2 else None)
    return out


def curve(speeds, res, hotel=rm.HOTEL):
    return [(u, None if r is None else range_km(WH, u, r, p_hotel=hotel)) for u, r in zip(speeds, res)]


def peak(c):
    ok = [(km, u) for u, km in c if km is not None]
    return max(ok) if ok else (0.0, 0.0)


def main(out=sys.stdout):
    p = lambda s="": print(s, file=out)
    mono = michell_r(4.0, 1, 0.0, 0.25, 0.0, DISP)
    rungs = [
        ("monohull", DISP, mono),
        ("catamaran", DISP, michell_r(4.0, 2, 0.25, 0.25, 0.15, DISP)),
        ("SWATH", DISP, swath_r(DISP)),
        ("planing", FAST, planing_r(FAST)),
        ("hydrofoil", FAST, foil_r(FAST)),
    ]
    p(f"basis: 200 kg, 25% battery at 200 Wh/kg = {WH:.0f} Wh, hotel {rm.HOTEL:.0f} W, eta 0.55 x 0.85; central case of each rung's box")
    p("# panel a: peak per rung")
    curves = {}
    for name, sp, res in rungs:
        c = curve(sp, res)
        curves[name] = c
        km, u = peak(c)
        feas = [x for x, y in c if y is not None]
        p(f"peak {name:<10} {km:7.1f} km at {u:5.2f} m/s; ratio to monohull {km / peak(curves['monohull'])[0]:.3f}; "
          f"feasible {feas[0]:.2f} to {feas[-1]:.2f} m/s")
    order = [n for n, _, _ in sorted(rungs, key=lambda r: -peak(curves[r[0]])[0])]
    p("peak order: " + " > ".join(order))
    p("# panel b: monohull at hotel loads")
    for h in HOTELS:
        c = curve(DISP, mono, hotel=h)
        km, u = peak(c)
        p(f"hotel {h:5.0f} W  peak {km:7.1f} km at {u:4.2f} m/s")
    p("# curves: rung speed_m_s range_km (- where infeasible), every grid point")
    for name, _, _ in rungs:
        for u, km in curves[name]:
            p(f"curve {name} {u:.2f} {'-' if km is None else f'{km:.2f}'}")
    for h in HOTELS:
        for u, km in curve(DISP, mono, hotel=h):
            p(f"curve hotel{h:.0f} {u:.2f} {km:.2f}")


if __name__ == "__main__":
    main()
