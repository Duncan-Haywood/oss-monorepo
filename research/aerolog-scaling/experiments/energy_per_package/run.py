"""Milestone 2a: energy per package from measured flights, against a diesel truck at the same stop density.

Predictions (written before the first run):
 (1) measured cruise energy per metre of the Matrice 100 is 50 to 80 J/m, above Stolaroff et al.'s modelled quadcopter (32 J/m);
 (2) energy alone puts the drone ahead of the truck out to a one-way distance above 20 km at Stolaroff's base stop density,
     so battery range, not energy per package, is the binding limit;
 (3) was dropped before the run: a truck's payload mass is not in the source, so per-kg-km is reported for the drone only.

Data: Rodrigues et al. flights (Figshare doi:10.1184/R1/12683453, CC BY 4.0), via ../rodrigues_energy/run.py.
Truck: Stolaroff et al. 2018, Nat. Commun. 9:409: Class 4 diesel truck, 100 miles, 151 packages, 8.7 gal = 7.8 MJ/package;
quadcopter model 32 J/m (0.5 kg package, 1 kg battery). Usage: python3 run.py [data dir]  (downloads ~107 MB if absent)
"""
import importlib.util
import os
import sys

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("rod", os.path.join(HERE, "..", "rodrigues_energy", "run.py"))
rod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rod)

TRUCK_MJ_PER_PKG = 7.8            # Stolaroff 2018, base case
TRUCK_PKG_PER_MILE = 151 / 100.0  # same source
STOLAROFF_QUAD_J_PER_M = 32.0
MILE = 1609.344
SEED, NBOOT = 0, 10000


def cruise_energy(root):
    d = rod.per_flight(root)
    fl = pd.read_csv(os.path.join(root, "flights.csv"), usecols=["flight", "battery_voltage", "battery_current",
                                                                  "velocity_x", "velocity_y", "velocity_z"])
    fl["vh"] = np.hypot(fl.velocity_x, fl.velocity_y)
    fl["p"] = fl.battery_voltage * fl.battery_current.abs()
    vs = {}
    for f, g in fl.groupby("flight"):
        if f in set(d.flight):
            v = float(d[d.flight == f].speed.iloc[0])
            c = g[(g.vh > 0.8 * v) & (g.vh < 1.2 * v) & (g.velocity_z.abs() < 0.5)]
            vs[f] = c.vh.mean()
    d["vg"] = d.flight.map(vs)
    d["j_per_m"] = d.p / d.vg
    d["m"] = rod.BASE_MASS + d.payload / 1000.0
    return d


def boot_mean(x, rng):
    x = np.asarray(x)
    return np.percentile([rng.choice(x, len(x)).mean() for _ in range(NBOOT)], [2.5, 97.5])


def main(root):
    rod.fetch(root)
    d = cruise_energy(root)
    rng = np.random.default_rng(SEED)
    print(f"flights {len(d)}; ground speed mean {d.vg.mean():.2f} m/s")
    print("\ncruise energy per metre (J/m), mean [95% bootstrap CI over flights], by commanded speed:")
    for v, g in d.groupby("speed"):
        lo, hi = boot_mean(g.j_per_m, rng)
        print(f"  {v:4.0f} m/s  n={len(g):3d}  {g.j_per_m.mean():6.1f} [{lo:.1f}, {hi:.1f}]")
    best = d.groupby("speed").j_per_m.mean().idxmin()
    sel = d[d.speed == best]
    print(f"\nbest speed {best:.0f} m/s; by payload at that speed:")
    ej = {}
    for p, g in sel.groupby("payload"):
        ej[p] = g.j_per_m.mean()
        print(f"  payload {p:5.0f} g  n={len(g):2d}  {g.j_per_m.mean():6.1f} J/m  Wh/km {g.j_per_m.mean()/3.6:6.1f}")
    e = d.j_per_m.mean()
    lo, hi = boot_mean(d.j_per_m, rng)
    print(f"\nall cruise flights: {e:.1f} J/m [{lo:.1f}, {hi:.1f}]; Stolaroff quad model {STOLAROFF_QUAD_J_PER_M:.0f} J/m "
          f"-> measured/model {e/STOLAROFF_QUAD_J_PER_M:.2f}")
    print("(1) held" if 50 <= e <= 80 else "(1) FAILED")

    # Round trip: out loaded, back empty; cruise energy only (no takeoff, landing or hover, so it flatters the drone).
    # Mean over all flights mixes speeds (41 of 134 are at 4 m/s), so the trip is costed at one speed at a time.
    ok = True
    for v in (8.0, 10.0):
        g = d[d.speed == v]
        e_l, e_e = g[g.payload > 0].j_per_m.mean(), g[g.payload == 0].j_per_m.mean()
        nl, ne = (g.payload > 0).sum(), (g.payload == 0).sum()
        rt = e_l + e_e
        print(f"\nat {v:.0f} m/s: loaded {e_l:.1f} J/m (n={nl}), empty {e_e:.1f} J/m (n={ne}); round trip {rt:.1f} J per m of one-way distance")
        print("  stop density x base | truck MJ/pkg | break-even one-way km")
        for k in (0.5, 1, 2, 4):
            t = TRUCK_MJ_PER_PKG / k
            print(f"  {k:5.1f}                {t:7.2f}        {t*1e6/rt/1000:7.1f}")
        ok &= TRUCK_MJ_PER_PKG * 1e6 / rt / 1000 > 20
        print(f"  energy per payload-kg-km at 0.5 kg, round trip: {rt*1000/0.5/1e3:.0f} kJ/(kg km)")
    print("\n(2) held" if ok else "\n(2) FAILED", "(base-density break-even above 20 km at 8 and 10 m/s)")
    print(f"Truck: 7.8 MJ per package at 1.07 km of route per package = {TRUCK_MJ_PER_PKG/(100*MILE/1000/151):.1f} MJ per package-km of route")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "/tmp/claude-0/rod")
