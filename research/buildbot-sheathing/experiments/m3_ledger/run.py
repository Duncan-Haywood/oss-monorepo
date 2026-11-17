"""Milestone 3, first part: does a ledger board square the sheet, and what does it leave?

    python experiments/m3_ledger/run.py > experiments/m3_ledger/results.txt

Writes results.json beside this file. MuJoCo seating runs are deterministic; the Monte Carlo uses
seed 5. A few minutes on one CPU.
"""
import json
import math
import os
import platform
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
import mujoco  # noqa: E402
from buildbot_sheathing import asbuilt as A  # noqa: E402
from buildbot_sheathing import budget as B  # noqa: E402
from buildbot_sheathing import ledger as L  # noqa: E402
from buildbot_sheathing import tack as K  # noqa: E402

MM = 1e-3
IN = B.IN
D = math.radians
deg = math.degrees
out = {"versions": {"python": platform.python_version(), "numpy": np.__version__,
                    "mujoco": mujoco.__version__}}

print("# Milestone 3, first part: ledger seating (buildbot-sheathing)")
print(f"sheet {L.W:.4f} x {L.H:.4f} x {L.T:.4f} m, {L.MASS} kg; gravity moment about a bottom corner "
      f"m g W/2 = {L.GRAVITY_MOMENT:.1f} N m")
print(f"PS 2 squareness limit: diagonals within {L.SQUARE_DIAG / IN:.3f} in -> corner angle "
      f"{deg(L.corner_angle_limit()):.4f} deg; edge straightness 1/16 in -> outward-bowed bottom edge "
      f"rocks up to {deg(2 * L.STRAIGHT / L.W):.4f} deg")
print(f"laser rating 1/8 in at 30 ft = {deg(L.LASER_SLOPE):.4f} deg")
print(f"wall contacts: corners r_bar = {L.r_bar('corners'):.4f} m, studs (4 lines x 5) r_bar = "
      f"{L.r_bar('studs'):.4f} m\n")

# A. released seating
MUS = [0.2, 0.3, 0.4, 0.5, 0.7]
FNS = [5, 25, 50, 100, 150, 200, 250, 300, 400, 600]
TH0 = [0.25, 0.5, 1.0, 2.0]
out["A"] = []
print("## A. Released seat: tilt left (deg) by wall friction, press and holder error; corner contacts")
for th0 in TH0:
    print(f"theta0 = {th0} deg")
    print("mu \\ F_n N " + " ".join(f"{f:8d}" for f in FNS))
    for mu in MUS:
        vals = []
        for fn in FNS:
            r = L.seat(theta0=D(th0), mu=mu, f_n=fn)
            vals.append(deg(r["theta"]))
            out["A"].append({"theta0_deg": th0, "mu": mu, "f_n": fn, "theta_deg": deg(r["theta"]),
                             "creep_rad_s": r["creep"]})
        print(f"{mu:10.1f} " + " ".join(f"{v:8.4f}" for v in vals))
    print()


# B. press threshold: least press leaving over half of theta0, simulated against predicted
def threshold(mu, layout, th0=1.0, lo=1.0, hi=1500.0, iters=14):
    def stuck(fn):
        return L.seat(theta0=D(th0), mu=mu, f_n=fn, layout=layout)["theta"] > D(th0) / 2
    if stuck(lo):
        return lo
    if not stuck(hi):
        return float("inf")
    for _ in range(iters):
        mid = (lo + hi) / 2
        lo, hi = (lo, mid) if stuck(mid) else (mid, hi)
    return hi


print("## B. Press threshold F_n* (N): least press that leaves over half of a 1 deg error")
print("layout   mu    simulated  predicted  ratio")
out["B"] = []
for layout in ("corners", "studs"):
    for mu in MUS:
        s = threshold(mu, layout)
        p = L.press_threshold(mu, layout)
        out["B"].append({"layout": layout, "mu": mu, "sim": s, "pred": p, "ratio": s / p})
        print(f"{layout:8s} {mu:4.1f}  {s:9.1f}  {p:9.1f}  {s / p:5.3f}")
print()

# C. held wrist
KS = [300, 1000, 3000, 10000, 30000]
print("## C. Held wrist: tilt left (deg), MuJoCo against max(0, theta0 - (mgW/2 - mu F_n r_bar)/k); mu 0.4")
print("F_n  theta0  k_N_m_per_rad  sim_deg   pred_deg")
out["C"] = []
for fn in (5, 100):
    for th0 in (0.5, 1.0, 2.0):
        for k in KS:
            r = L.seat(theta0=D(th0), mu=0.4, f_n=fn, k_hold=k)
            p = L.held_residual(D(th0), k, 0.4, fn)
            out["C"].append({"f_n": fn, "theta0_deg": th0, "k": k, "sim_deg": deg(r["theta"]),
                             "pred_deg": deg(p)})
            print(f"{fn:4d}  {th0:6.2f}  {k:13d}  {deg(r['theta']):8.4f}  {deg(p):8.4f}")
print()

# D. descent speed, release time, contact stiffness
print("## D. Sensitivity of a released seat (mu 0.4, F_n 50 N, theta0 1 deg)")
out["D"] = []
for name, kw in [("v 0.01 m/s", dict(v=0.01)), ("v 0.05 m/s", dict(v=0.05)), ("v 0.2 m/s", dict(v=0.2)),
                 ("release 0.1 s", dict(t_release=0.1)), ("release 2 s", dict(t_release=2.0)),
                 ("softer contact (solref 0.01)", dict(solref=0.01)),
                 ("timestep 0.25 ms", dict(timestep=2.5e-4)), ("stud contacts", dict(layout="studs")),
                 ("theta0 -1 deg", dict(theta0=D(-1.0)))]:
    args = dict(theta0=D(1.0), mu=0.4, f_n=50.0)
    args.update(kw)
    r = L.seat(**args)
    out["D"].append({"case": name, "theta_deg": deg(r["theta"])})
    print(f"{name:30s} {deg(r['theta']):9.5f} deg")
print()

# E. a bottom edge bowed outward, and creep under friction
print("## E. Bottom edge bowed outward by 1/16 in (PS 2 limit): MuJoCo against 2 s / W")
out["E"] = []
for th0 in (1.0, -1.0, 0.25, -0.25):
    r = L.seat(theta0=D(th0), mu=0.4, f_n=50.0, sag=L.STRAIGHT)
    out["E"].append({"theta0_deg": th0, "theta_deg": deg(r["theta"]),
                     "pred_abs_deg": deg(2 * L.STRAIGHT / L.W)})
    print(f"theta0 {th0:+5.2f} deg: tilt {deg(r['theta']):+.4f} deg (predicted +/- {deg(2 * L.STRAIGHT / L.W):.4f})")
r = L.seat(theta0=D(1.0), mu=0.4, f_n=400.0, settle=10.0)
out["E_creep"] = {"theta_deg_after_10s": deg(r["theta"]), "creep_deg_per_s": deg(r["creep"])}
print(f"stuck at F_n 400 N, after 10 s: tilt {deg(r['theta']):.4f} deg, creep {deg(r['creep']):.2e} deg/s\n")

# F. clean sheets with a ledger hang (milestone 4's model)
T = 20000
FRAMING = {"2x straight": dict(joint_band=None),
           "2 x 2x low warp": dict(joint_band=A.Band(face=3.0 * IN), bow_mean=0.11 * IN, twist_mean=0.08 * IN)}
BAND = A.Band()
SX = {"2x straight": 0.0, "2 x 2x low warp": 3 * MM}


def draw(s_corner, frac):
    def f(rng, n):
        return L.ledger_tilt(rng, n, s_corner=s_corner) + L.panel_tilt(rng, n, frac, frac)
    return f


def clean(fr, s_corner, frac, seed=5):
    return K.simulate(trials=T, seed=seed, band=BAND, s_x=SX[fr], theta_draw=draw(s_corner, frac),
                      **FRAMING[fr])["clean"]


def sd_deg(s_corner, frac):
    return deg(float(np.std(draw(s_corner, frac)(np.random.default_rng(9), 400000))))


SC = [0.0, 0.25, 0.5, 1.0, 2.0]
FR = [0.0, 0.25, 0.5, 1.0]
print("## F. Clean sheets with a released ledger seat (three reads, edge aim, tacked; 20,000 sheets, seed 5)")
print("tilt = laser line (uniform within its rating) + ledger height error at each corner + panel squareness "
      "and bottom-edge bow (uniform within frac x the PS 2 limits)")
out["F"] = {"sd_deg": [], "clean": {}}
print("tilt sd (deg): s_corner_mm \\ panel frac " + " ".join(f"{f:6.2f}" for f in FR))
for sc in SC:
    row = [round(sd_deg(sc * MM, f), 4) for f in FR]
    out["F"]["sd_deg"].append(row)
    print(f"{sc:39.2f} " + " ".join(f"{v:6.4f}" for v in row))
for fr in FRAMING:
    print(f"clean, {fr} (sx {SX[fr] / MM:.0f} mm): s_corner_mm \\ panel frac " + " ".join(f"{f:6.2f}" for f in FR))
    grid = []
    for sc in SC:
        row = [round(clean(fr, sc * MM, f), 4) for f in FR]
        grid.append(row)
        print(f"{sc:44.2f} " + " ".join(f"{v:6.4f}" for v in row))
    out["F"]["clean"][fr] = {"s_corner_mm": SC, "panel_frac": FR, "clean": grid}
    print()


# panel fraction needed on straight single 2x with a perfect ledger
def frac_needed(target=0.95, iters=12):
    if clean("2x straight", 0.0, 0.0) < target:
        return 0.0
    lo, hi = 0.0, 1.0
    if clean("2x straight", 0.0, hi) >= target:
        return 1.0
    for _ in range(iters):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if clean("2x straight", 0.0, mid) >= target else (lo, mid)
    return lo


fn95 = frac_needed()
out["F"]["frac_for_95_2x_perfect_ledger"] = fn95
print(f"panel geometry allowed for 95% on straight single 2x, perfect ledger: {fn95:.3f} x the PS 2 limits "
      f"(diagonals within {fn95 * L.SQUARE_DIAG / IN:.4f} in, bottom edge within {fn95 * L.STRAIGHT / IN:.4f} in; "
      f"corner angle {fn95 * deg(L.corner_angle_limit()):.4f} deg)\n")

# G. hypotheses
a = out["A"]
h13_cells = [r for r in a if r["f_n"] <= 50 and 0.3 <= r["mu"] <= 0.5]
h13_max = max(abs(r["theta_deg"]) for r in h13_cells)
h13 = h13_max <= 0.005
b_corner = [r for r in out["B"] if r["layout"] == "corners"]
h14 = all(abs(r["ratio"] - 1) <= 0.25 for r in b_corner)
c_err = [abs(r["sim_deg"] - r["pred_deg"]) for r in out["C"]]
c_ok = [abs(r["sim_deg"] - r["pred_deg"]) <= max(0.005, 0.1 * abs(r["pred_deg"])) for r in out["C"]]
h15 = all(c_ok)
f2 = out["F"]["clean"]
i05 = SC.index(0.5)
wide = f2["2 x 2x low warp"]["clean"][i05][FR.index(1.0)]
narrow = f2["2x straight"]["clean"][i05][FR.index(1.0)]
h16 = wide >= 0.95 and narrow < 0.95
perfect = f2["2x straight"]["clean"][0][FR.index(1.0)]
h17 = perfect < 0.90
out["hypotheses"] = {
    "H13": {"held": h13, "max_abs_deg": h13_max},
    "H14": {"held": h14, "ratios": [round(r["ratio"], 3) for r in b_corner]},
    "H15": {"held": h15, "max_abs_err_deg": max(c_err), "cells_ok": sum(c_ok), "cells": len(c_ok)},
    "H16": {"held": h16, "clean_2x2x_low": wide, "clean_2x_straight": narrow},
    "H17": {"held": h17, "clean_2x_straight_perfect_ledger": perfect, "frac_for_95": fn95},
}
print("## G. Pre-registered hypotheses (LOG.md, 2026-11-12)")
print(f"H13 {'held' if h13 else 'refuted'}: largest tilt left at F_n <= 50 N, mu 0.3-0.5: {h13_max:.5f} deg")
print(f"H14 {'held' if h14 else 'refuted'}: simulated / predicted press threshold (corners): "
      + ", ".join(f"{r['ratio']:.3f}" for r in b_corner))
print(f"H15 {'held' if h15 else 'refuted'}: {sum(c_ok)}/{len(c_ok)} cells within 0.005 deg or 10%; "
      f"largest error {max(c_err):.4f} deg")
print(f"H16 {'held' if h16 else 'refuted'}: ledger 0.5 mm, full PS 2 limits: 2 x 2x low warp {wide:.4f}, "
      f"2x straight {narrow:.4f}")
print(f"H17 {'held' if h17 else 'refuted'}: perfect ledger, full PS 2 limits, 2x straight: {perfect:.4f}; "
      f"95% needs panels within {fn95:.3f} of the limits")

with open(os.path.join(HERE, "results.json"), "w") as f:
    json.dump(out, f, indent=1)
