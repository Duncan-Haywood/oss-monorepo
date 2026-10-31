"""Milestone 2c: how much of the Matrice 100's fixed flight energy is set by cruise altitude, and what does that do to range?

Predictions (written before the first run, see LOG.md; they assumed two altitudes, 25 and 50 m. The data has four,
25 to 100 m, so they were ill-posed and are reported as such; the pooled model below is a post-hoc correction):
 (1) the 50 m altitude adds 15 to 60% to the fixed energy E0 at 8 m/s;
 (2) the per-metre slope differs between altitudes by under 15%;
 (3) one-way range with one TB48D pack (80% usable) at 8 m/s is at least 20% longer at 25 m than at 50 m.
Model: e_tot = speed effect + k_alt x (altitude/25 m - 1) + k_pay x (payload/250 g) + j x cruise distance, speeds 4 to 10 m/s pooled.
Data: Rodrigues et al. (Figshare doi:10.1184/R1/12683453, CC BY 4.0). Usage: python3 run.py [data dir]
"""
import importlib.util
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("me", os.path.join(HERE, "..", "mission_energy", "run.py"))
me = importlib.util.module_from_spec(spec)
spec.loader.exec_module(me)
SEED, NBOOT = 0, 5000
SPEEDS = (4.0, 6.0, 8.0, 10.0)


def design(g):
    cols = [(g.speed == v).astype(float).values for v in SPEEDS]
    cols += [(g.alt.values / 25.0 - 1), g.payload.values / 250.0, g.cd.values]
    return np.column_stack(cols)


def fit(g):
    b, *_ = np.linalg.lstsq(design(g), g.e_tot.values, rcond=None)
    return b


def oneway(b, v, alt, usable=0.8):
    e0 = b[SPEEDS.index(v)] + b[4] * (alt / 25.0 - 1)
    return (me.PACK_WH * 3600 * usable - 2 * e0) / (2 * b[6])


def main(root):
    me.rod.fetch(root)
    o = me.whole_flights(root)
    o["cd"] = o.t_cr * o.speed
    o["alt"] = o.alt.astype(float)   # parameters.csv codes altitude as text in the per-flight table
    o = o[o.speed.isin(SPEEDS)].reset_index(drop=True)
    print(f"flights {len(o)}; payload values {[int(x) for x in sorted(o.payload.unique())]} (as coded in parameters.csv); altitudes {[int(x) for x in sorted(o.alt.unique())]} m")
    print("mean whole-flight energy (kJ) by altitude and payload, speeds 4 to 10 m/s pooled:")
    print((o.groupby(["alt", "payload"]).e_tot.mean().unstack() / 1e3).round(1).to_string())
    b = fit(o)
    rng = np.random.default_rng(SEED)
    bs = np.array([fit(o.iloc[rng.integers(0, len(o), len(o))]) for _ in range(NBOOT)])
    lo, hi = np.percentile(bs, [2.5, 97.5], axis=0)
    res = o.e_tot.values - design(o) @ b
    print(f"\nn={len(o)}, residual sd {res.std(ddof=7)/1e3:.1f} kJ, R2 {1 - res.var() / o.e_tot.var():.2f}")
    for i, v in enumerate(SPEEDS):
        print(f"  E0 at 25 m, no payload, {v:.0f} m/s: {b[i]/1e3:.1f} kJ [{lo[i]/1e3:.1f}, {hi[i]/1e3:.1f}]")
    print(f"  per +25 m altitude: {b[4]/1e3:.1f} kJ [{lo[4]/1e3:.1f}, {hi[4]/1e3:.1f}]")
    print(f"  per +250 payload unit: {b[5]/1e3:.1f} kJ [{lo[5]/1e3:.1f}, {hi[5]/1e3:.1f}]")
    print(f"  cruise slope: {b[6]:.1f} J/m [{lo[6]:.1f}, {hi[6]:.1f}]")
    print("\none-way range, one pack, 80% usable, no payload (km, bootstrap 95% interval):")
    for v in (6.0, 8.0, 10.0):
        row = []
        for alt in (25, 50, 75, 100):
            r = np.array([oneway(x, v, alt) for x in bs if x[6] > 0]) / 1e3
            row.append(f"{alt} m {oneway(b, v, alt)/1e3:.2f} [{np.percentile(r,2.5):.2f}, {np.percentile(r,97.5):.2f}]")
        print(f"  {v:.0f} m/s: " + "; ".join(row))
    # original predictions at 8 m/s, 25 vs 50 m
    e25, e50 = b[2], b[2] + b[4]
    share = (e50 / e25 - 1) * 100
    print(f"\n(1) {'held' if 15 <= share <= 60 else 'FAILED'} (premise of two altitudes was wrong): 50 m vs 25 m adds {share:.0f}% to E0 at 8 m/s")
    print("(2) not tested: the pooled model has one cruise slope and no altitude interaction")
    ratio = oneway(b, 8.0, 25) / oneway(b, 8.0, 50)
    print(f"(3) {'held' if ratio >= 1.2 else 'FAILED'}: 25 m range / 50 m range = {ratio:.2f} at 8 m/s")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "/tmp/rod")
