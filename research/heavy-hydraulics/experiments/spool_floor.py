"""Milestone 5p (measured part): the PVG 32 full-travel spool-drop floor on the measured loader.

5o's closing-law-free open-centre floor set dp_spool = 0. A spool passing q cannot have less than the
drop at which it passes q fully open, so here the open-centre pump pressure while moving is
max_i (p_i + dp_floor_i(q_i)) (`heavy_hydraulics.spool_floor`), each section on the smallest PVG 32
spool covering a design flow taken from the trace (p99.9 of its positive P-port flow; swept). Motion,
pump, shaft model and Willans slope as 5o. Predictions R1 to R5 are in LOG.md (5p), registered before
any run; NOT YET RUN (Zenodo refused the proxy on 2026-11-11, see LOG).

Data: Linjama et al., Zenodo doi:10.5281/zenodo.10639199, CC BY 4.0 (see measured_loader.py).
Needs numpy and scipy. Usage: python spool_floor.py <path to Short_Y_cycle_data.mat>
"""
import math
import os
import sys

import numpy as np

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, HERE)
from heavy_hydraulics.measured import pump_torque, cycle_starts  # noqa: E402
from heavy_hydraulics.spool_floor import read_table, size_spool, floor_drop  # noqa: E402

TABLE = read_table(os.path.join(HERE, "data", "pvg32_flow_full_travel.csv"))
NAMES = ("lift", "tilt")
B_WILLANS = 0.2332   # L/kWh, measured_loader_results.txt (5n)
SIZING = (("p99", 99.0, 0), ("p99.9", 99.9, 0), ("max", 100.0, 0), ("p99.9 + 1 size", 99.9, 1))


def floor_vec(q, row, law):
    q = np.maximum(q, 0.0)
    if law == "orifice":
        return 10.0 * (q / row["q10"]) ** 2
    return 10.0 * (q / row["q10"]) ** (1.0 / row["n"])


def oc_floor(r, masks, rows, law, p_neutral, leak=2.5, sl=slice(None)):
    """Open-centre hydraulic and shaft energy (J) with the full-travel floor, and the
    hydraulic-energy-weighted mean extra drop while moving (bar)."""
    w = r["w"][sl]
    q_fix = np.maximum(0.0, 63e-6 * 1e3 * w / (2 * math.pi) * 60 - leak)
    pl = np.full_like(q_fix, -np.inf)
    pin = np.full_like(q_fix, -np.inf)
    q_big = np.zeros_like(q_fix)
    for (q, p), m, row in zip(r["secs"], masks, rows):
        q, p, m = q[sl], p[sl], m[sl]
        on = m & (q > 0) & ~np.isnan(p)
        pp = np.nan_to_num(p, nan=-np.inf)
        pl = np.where(on, np.maximum(pl, pp + floor_vec(q, row, law)), pl)
        pin = np.where(on, np.maximum(pin, pp), pin)
        q_big += np.where(on, q, 0.0)
    mv = np.isfinite(pl)
    q_oc = np.where(mv, np.maximum(q_fix, q_big), q_fix)
    p_oc = np.where(mv, pl, p_neutral)
    dt = r["dt"]
    hp = q_oc * p_oc
    hyd = float(hp.sum() * dt / 0.6)
    extra = float(((pl - pin) * hp)[mv].sum() / max(hp[mv].sum(), 1e-12))
    alpha = np.maximum(1.0, q_oc / np.maximum(q_fix + leak, 1e-9))
    shaft = float((pump_torque(alpha, p_oc, w) * w).sum() * dt)
    return hyd, shaft, extra


def compute(r, floors, vec, bootstrap):
    """r: loaded record (measured_loader.load); floors: 5o noise floors per section."""
    out = []
    p = out.append
    dt = r["dt"]
    base = vec(r, 24.9)
    meas, ls_shaft = base["measured"], base["ls_shaft"]
    fuel_L = r["fuel"].sum() * dt / 3600
    masks = [s[0] > f for s, f in zip(r["secs"], floors)]
    p(f"noise-floor q_min (5o): lift {floors[0]:.3f}, tilt {floors[1]:.3f} L/min; Willans slope {B_WILLANS} L/kWh")
    res = {}
    for lab, pct, up in SIZING:
        rows = []
        for (q, _), nm in zip(r["secs"], NAMES):
            qd = float(np.percentile(q[q > 0], pct))
            rows.append(size_spool(qd, TABLE, up))
            p(f"  sizing {lab}: {nm} design flow {qd:.1f} L/min -> spool {rows[-1]['spool']} (rated {rows[-1]['rated']:g})")
        for law in ("orifice", "power"):
            for pn in (5.0, 10.0):
                h, s, ex = oc_floor(r, masks, rows, law, pn)
                res[(lab, law, pn)] = (h / meas, rows)
                p(f"    {law:7s} p_neutral {pn:4.1f}: OC/LS hydraulic {h/meas:.3f}, shaft {s/ls_shaft:.3f}, "
                  f"extra fuel {B_WILLANS*(s-ls_shaft)/3.6e6/fuel_L*100:.1f}%; weighted extra drop {ex:.2f} bar")
                if (lab, law, pn) == ("p99.9", "orifice", 5.0):
                    r2 = ex
    r1, rows1 = res[("p99.9", "orifice", 5.0)]
    r3 = abs(res[("p99.9", "power", 5.0)][0] - r1)
    span = [res[(lab, "orifice", 5.0)][0] for lab, _, _ in SIZING]
    starts = cycle_starts(list(r["x"]), 0.30)
    per = []
    for i0, i1 in zip(starts, starts[1:]):
        sl = slice(i0, i1)
        h, _, _ = oc_floor(r, masks, rows1, "orifice", 5.0, sl=sl)
        per.append(h / vec(r, 24.9, sl=sl)["measured"])
    lo, hi = bootstrap(per)
    p(f"per cycle ({len(per)}), orifice floor, p99.9 sizing, p_neutral 5: mean {sum(per)/len(per):.3f} "
      f"(95% bootstrap {lo:.3f} to {hi:.3f}); min {min(per):.3f}")
    p(f"R1 {'HOLDS' if 1.41 <= r1 <= 1.48 else 'REFUTED'} (1.41 to 1.48: {r1:.3f})")
    p(f"R2 {'HOLDS' if r2 < 5 else 'REFUTED'} (weighted extra drop < 5 bar: {r2:.2f})")
    p(f"R3 {'HOLDS' if r3 < 0.03 else 'REFUTED'} (|power - orifice| < 0.03: {r3:.3f})")
    p(f"R4 {'HOLDS' if max(span) - min(span) < 0.05 else 'REFUTED'} (sizing span < 0.05: {max(span)-min(span):.3f})")
    p(f"R5 {'HOLDS' if min(per) >= 1.20 else 'REFUTED'} (every cycle >= 1.20: min {min(per):.3f})")
    return "\n".join(out)


def main(path):
    from measured_loader import load, vec, bootstrap
    from measured_motion import positions, stationary_np
    r = load(path)
    win = int(round(1.0 / r["dt"]))
    floors = [float(np.percentile(np.abs(q[stationary_np(x, win, 0.5e-3)]), 99))
              for (q, _), (x, _) in zip(r["secs"], positions(path))]
    return compute(r, floors, vec, bootstrap)


if __name__ == "__main__":
    text = main(sys.argv[1])
    print(text)
    with open(os.path.join(HERE, "spool_floor_results.txt"), "w") as fh:
        fh.write(text + "\n")
