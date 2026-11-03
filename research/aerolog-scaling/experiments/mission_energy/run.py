"""Milestone 2b: whole-flight energy of the Matrice 100 (takeoff, climb, cruise, descent) and the one-way range it implies.

Predictions (written before the first run):
 (1) non-cruise energy (everything outside the cruise window) is 10 to 30% of a route flight's energy;
 (2) whole-flight energy per metre of route is at least 20% above the cruise-only figure of milestone 2a at 8 m/s;
 (3) with one TB48D pack (129.96 Wh, retailer figure) a loaded round trip at 8 m/s reaches under 10 km one way.
Data: Rodrigues et al. (Figshare doi:10.1184/R1/12683453, CC BY 4.0). Usage: python3 run.py [data dir]
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
PACK_WH = 129.96      # TB48D, 5700 mAh x 22.8 V; retailer listing (Adorama), no DJI page checked
USABLE = 0.8          # fraction of nameplate used before landing reserve: an assumption, swept below
SEED, NBOOT = 0, 10000


def whole_flights(root):
    d = rod.per_flight(root)
    fl = pd.read_csv(os.path.join(root, "flights.csv"), usecols=["flight", "time", "battery_voltage", "battery_current",
                                                                  "position_x", "position_y", "velocity_x", "velocity_y", "velocity_z"])
    fl["p"] = fl.battery_voltage * fl.battery_current.abs()
    fl["vh"] = np.hypot(fl.velocity_x, fl.velocity_y)
    rows = []
    for f, g in fl.groupby("flight"):
        if f not in set(d.flight):
            continue
        r = d[d.flight == f].iloc[0]
        g = g.sort_values("time")
        t = g.time.values
        dt = np.diff(t, prepend=t[0])
        e_tot = float((g.p.values * dt).sum())
        v = r.speed
        cr = ((g.vh > 0.8 * v) & (g.vh < 1.2 * v) & (g.velocity_z.abs() < 0.5)).values
        e_cr = float((g.p.values * dt)[cr].sum())
        t_cr = float(dt[cr].sum())
        dist = float((g.vh.values * dt).sum())
        rows.append(dict(flight=f, speed=v, payload=r.payload, alt=r.alt, dur=float(t[-1] - t[0]), e_tot=e_tot, e_cr=e_cr,
                         t_cr=t_cr, dist=dist, vmax=float(g.vh.max())))
    o = pd.DataFrame(rows)
    o["frac_non"] = 1 - o.e_cr / o.e_tot
    o["j_m_whole"] = o.e_tot / o.dist
    o["p_nonc"] = (o.e_tot - o.e_cr) / (o.dur - o.t_cr)
    return o


def ci(x, rng):
    x = np.asarray(x)
    return np.percentile([rng.choice(x, len(x)).mean() for _ in range(NBOOT)], [2.5, 97.5])


def main(root):
    rod.fetch(root)
    o = whole_flights(root)
    rng = np.random.default_rng(SEED)
    print(f"route flights {len(o)}; duration {o.dur.mean():.0f} s mean; whole-flight energy {o.e_tot.mean()/3600:.1f} Wh mean, max {o.e_tot.max()/3600:.1f} Wh")
    print(f"mean path length {o.dist.mean():.0f} m")
    lo, hi = ci(o.frac_non, rng)
    print(f"\nnon-cruise share of energy: {o.frac_non.mean()*100:.1f}% [{lo*100:.1f}, {hi*100:.1f}]")
    print(f"mean non-cruise power {o.p_nonc.mean():.0f} W")
    print("(1) held" if 0.10 <= o.frac_non.mean() <= 0.30 else "(1) FAILED")
    print("\nby commanded speed: whole-flight J/m, cruise-only J/m, ratio")
    for v, g in o.groupby("speed"):
        w = g.j_m_whole.mean()
        c = (g.e_cr / (g.t_cr * v)).mean()   # approximate ground speed = commanded
        print(f"  {v:4.0f} m/s n={len(g):3d} whole {w:6.1f}  share non-cruise {g.frac_non.mean()*100:5.1f}%  Wh/flight {g.e_tot.mean()/3600:5.1f}")
    # range: route flights are out-and-back loops of fixed length per route, so per-metre whole-flight energy
    # already includes the fixed takeoff/landing cost spread over that route length; it overstates cost on longer
    # legs. Split instead into fixed (non-cruise) energy E0 and cruise J/m by regression across routes.
    print("\nfixed + per-metre split: e_tot = E0 + j * cruise_distance, fitted per speed and payload class")
    o["cd"] = o.t_cr * o.speed
    res = {}
    for v in (8.0, 10.0):
        g = o[(o.speed == v)]
        x = np.column_stack([np.ones(len(g)), g.cd.values])
        b, *_ = np.linalg.lstsq(x, g.e_tot.values, rcond=None)
        res[v] = b
        print(f"  {v:.0f} m/s n={len(g)} E0 {b[0]:.0f} J, per metre {b[1]:.1f} J/m, cruise distance range {g.cd.min():.0f} to {g.cd.max():.0f} m")
        for usable in (0.6, 0.8, 1.0):
            cap = PACK_WH * 3600 * usable
            oneway = (cap - 2 * b[0]) / (2 * b[1])
            print(f"     one pack, usable {usable:.0%}: round trip one-way range {oneway/1000:.2f} km;  two packs {((2*cap-2*b[0])/(2*b[1]))/1000:.2f} km")
    r8 = (PACK_WH * 3600 * USABLE - 2 * res[8.0][0]) / (2 * res[8.0][1])
    print(f"\n(3) {'held' if r8 < 10000 else 'FAILED'}: one pack, 80% usable, 8 m/s: {r8/1000:.2f} km one way")
    # bracket: the regression slope (113 J/m at 8 m/s) absorbs acceleration and braking, which grow with distance in
    # these short legs; cruise-only 2a figure with the same fixed energy is the optimistic end.
    for v in (8.0, 10.0):
        g = o[o.speed == v]
        jc = (g.e_cr / (g.t_cr * v)).mean()
        cap = PACK_WH * 3600 * USABLE
        print(f"bracket {v:.0f} m/s, one pack 80%: regression {(cap - 2*res[v][0])/(2*res[v][1])/1000:.2f} km, "
              f"cruise-only slope {jc:.0f} J/m with E0 {(cap - 2*res[v][0])/(2*jc)/1000:.2f} km; cruise window longest {g.cd.max():.0f} m")
    w8 = o[o.speed == 8.0].j_m_whole.mean()
    cr8 = (o[o.speed == 8.0].e_cr / (o[o.speed == 8.0].t_cr * 8.0)).mean()
    print(f"(2) {'held' if w8 >= 1.2 * cr8 else 'FAILED'}: whole {w8:.1f} vs cruise-only {cr8:.1f} J/m at 8 m/s ({w8/cr8:.2f})")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "/tmp/rod")
