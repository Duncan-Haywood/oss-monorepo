"""Milestone 3, second part: can a stock Unitree G1 or H1 work a sheet the ledger carries?

    python experiments/m3b_humanoid/run.py > experiments/m3b_humanoid/results.txt

Writes results.json beside this file. Deterministic (MuJoCo, static whole-body solves); about
ten minutes on one CPU. Needs MuJoCo Menagerie's G1 and H1, which buildbot-payload's fetch.py
clones at a pinned commit on first use.
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
from buildbot_sheathing import humanoid as Hm  # noqa: E402
from buildbot_sheathing import ledger as L  # noqa: E402
from buildbot_payload import fetch, model as P  # noqa: E402

D, deg = math.radians, math.degrees
out = {"versions": {"python": platform.python_version(), "numpy": np.__version__,
                    "mujoco": mujoco.__version__}, "menagerie_commit": fetch.COMMIT}
MU_W = 0.4                       # wall friction, part one's middle value (0.25-0.5 secondary table)
MU_LS = [0.3, 0.4, 0.5, 0.6, 0.7]

print("# Milestone 3, second part: a stock humanoid at the ledger (buildbot-sheathing)")
print(f"sheet {L.W:.4f} x {L.H:.4f} m, {L.MASS} kg, weight {L.MASS * L.G:.1f} N; wall friction mu_w = {MU_W}")
print(f"Menagerie commit {fetch.COMMIT}\n")

# A. sliding along the ledger: closed form vs MuJoCo
print("## A. Slide along the ledger: push height that tips the sheet (m above its bottom edge)")
print("Closed form h* = (m g W/2 + mu_w F_n h_press) / (mu_l m g + mu_w F_n); W/(2 mu_l) when h_press = h.")
print("MuJoCo: least push height whose slide tilts the sheet past 0.5 deg (bisection, 1 cm).")
print("mu_l  F_n  h_press | P_N   h*_closed  h*_mujoco  ratio | slid_m_at_0.8h* peak_tilt_deg_at_0.8h*")
out["A"] = []
cases = [(mu, fn, None) for mu in MU_LS for fn in (50.0, 100.0)] + \
        [(mu, 50.0, hp) for mu in (0.5, 0.7) for hp in (0.6, 1.2)]
for mu, fn, hp in cases:
    hc = Hm.tip_height(mu, MU_W, fn, hp)
    hs = Hm.tip_threshold_sim(mu, MU_W, fn, hp)
    below = Hm.slide_sim(min(0.8 * hc, L.H - 0.05), mu, MU_W, fn, hp)
    ratio = None if hs is None or hc > L.H else hs / hc
    row = {"mu_l": mu, "f_n": fn, "h_press": hp, "P": Hm.slide_force(mu, MU_W, fn), "h_closed": hc,
           "h_sim": hs, "ratio": ratio, "slid_below": below["slid"],
           "tilt_below_deg": deg(below["peak_tilt"]), "push_mean_below": below["push_mean"]}
    out["A"].append(row)
    print(f"{mu:4.1f} {fn:5.0f} {('= h' if hp is None else f'{hp:.1f}'):>6} | {row['P']:5.1f} {hc:9.3f} "
          f"{('none' if hs is None else f'{hs:.3f}'):>10} {('-' if ratio is None else f'{ratio:.3f}'):>6} | "
          f"{below['slid']:.3f} {deg(below['peak_tilt']):.4f}")
print("(no MuJoCo threshold = the sheet did not tip even pushed at its top; the closed form is above H)\n")

# A2. palm friction: pushing sideways through the face needs a press the robot cannot give
print("## A2. Sliding through palm friction alone: the press needed, F_n >= mu_l m g / (mu_h - mu_w)")
out["A2"] = []
print("mu_l  mu_h=0.5  0.6  0.8  1.0 (N; '-' impossible: mu_h <= mu_w)")
for mu in MU_LS:
    vals = []
    for mh in (0.5, 0.6, 0.8, 1.0):
        need = mu * L.MASS * L.G / (mh - MU_W) if mh > MU_W else None
        vals.append(need)
        out["A2"].append({"mu_l": mu, "mu_h": mh, "f_n_needed": need})
    print(f"{mu:4.1f} " + " ".join(f"{v:7.0f}" if v else "      -" for v in vals))
print()

# B. whole body
for n in fetch.ROBOTS:
    fetch.model_path(n)
robots = {n: Hm.robot(n) for n in fetch.ROBOTS}
ZS = [0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3]
XS = [0.3, 0.4]
MU_FOOT = [0.3, 0.6]             # rubber on concrete, swept as in buildbot-fasten
out["B"] = []
print("## B. Whole-body static checks (feet planted, torque limits, both soles loaded, no slip)")
print("carry = heaviest load held in both hands, no push (kg; sheet is 21.8);")
print("press = largest press into the seated sheet (N); slide mu_l = largest press while also")
print(f"pushing the slide force mu_l m g + {MU_W} F_n sideways (N); '-' = even 0 N fails. Limit in brackets.")
for n, (rob, d0) in robots.items():
    for mf in MU_FOOT:
        print(f"\n{n}, foot friction {mf}")
        print("x_m z_m | carry_kg | press_N | slide0.3_N | slide0.5_N")
        for x in XS:
            q = None
            for z in ZS:
                cw, cwhy = P.max_payload(rob, d0, (x, z)) if mf == MU_FOOT[-1] else (None, "")
                pr, pwhy = Hm.max_press(rob, d0, (x, z), mu_foot=mf)
                s3, w3 = Hm.max_press(rob, d0, (x, z), mu_l=0.3, mu_w=MU_W, mu_foot=mf)
                s5, w5 = Hm.max_press(rob, d0, (x, z), mu_l=0.5, mu_w=MU_W, mu_foot=mf)
                row = {"robot": n, "mu_foot": mf, "x": x, "z": z, "carry_kg": cw, "carry_why": cwhy,
                       "press": pr, "press_why": pwhy, "slide03": s3, "slide03_why": w3,
                       "slide05": s5, "slide05_why": w5}
                out["B"].append(row)
                f = lambda v, w: ("-" if v is None else f"{v:.0f}") + f" [{w}]"  # noqa: E731
                cs = "(as mu 0.6)" if cw is None and mf != MU_FOOT[-1] else f"{cw:.1f} [{cwhy}]" if cw is not None else f"- [{cwhy}]"
                print(f"{x:.1f} {z:.1f} | {cs} | {f(pr, pwhy)} | {f(s3, w3)} | {f(s5, w5)}")
print()

# C. rotational stiffness at the press pose
print("## C. Sheet rotational stiffness about the wall normal at the press pose (F_n = 50 N, x 0.35 m)")
print("Pivot = the landing corner on the ledger (sheet bottom at floor level, robot centred on the sheet).")
print("Limit (part one, mu_w 0.4, F_n 50 N): k* = (m g W/2 - mu F_n r_bar) / theta0 = "
      + ", ".join(f"{Hm.limit_stiffness(D(t)):.0f} at {t} deg" for t in (0.5, 1.0, 2.0)) + " N m/rad")
print("A holder above k* keeps part of its error. kp_scale* = factor on the sourced gains that reaches k* at 1 deg.")
VARIANTS = {"g1": [("stock", ()), ("wrist roll released", ("wrist_roll",)), ("wrists released", ("wrist",))],
            "h1": [("stock", ())]}
out["C"] = []
print("robot z_m grip variant | K_corner  K_free_translation | kp_scale*(corner) | residual_deg at 1 deg, stock")
for n, (rob, d0) in robots.items():
    for z in (0.7, 1.0, 1.3):
        ok, why, q, _ = Hm.hold(rob, d0, (0.35, z), [-50.0, 0.0, 0.0])
        piv = np.array([0.35, -L.W / 2, 0.0])
        for grip in ("rigid", "point"):
            for label, rel in VARIANTS[n]:
                kp = Hm.gains(rob, released=rel)
                kc = Hm.rotational_stiffness(rob, q, kp, piv, grip)
                kf = Hm.rotational_stiffness(rob, q, kp, piv, grip, free_translation=True)
                lim = Hm.limit_stiffness(D(1.0))
                res = deg(L.held_residual(D(1.0), kc, MU_W, 50.0))
                row = {"robot": n, "z": z, "pose_ok": bool(ok), "grip": grip, "variant": label, "K_corner": kc,
                       "K_free": kf, "kp_scale_star": lim / kc, "residual_deg_1deg": res}
                out["C"].append(row)
                print(f"{n} {z:.1f} {grip:5s} {label:20s} | {kc:10.0f} {kf:10.1f} | {lim / kc:10.2f} | {res:.4f}"
                      + ("" if ok else f"  (pose: {why})"))
print()

# C2. what the stiffness does to the hold: deflection under the sheet's own weight
print("## C2. The other side of soft: rotation a stock-gain hold gives under the sheet's own gravity")
print("moment about the landing corner (m g W/2 = %.0f N m) if nothing feeds the weight forward" % L.GRAVITY_MOMENT)
for r in out["C"]:
    if r["variant"] == "stock" and r["z"] == 1.0:
        print(f"{r['robot']} {r['grip']:5s}: {deg(L.GRAVITY_MOMENT / r['K_corner']):.2f} deg")
print()

with open(os.path.join(HERE, "results.json"), "w") as fh:
    json.dump(out, fh, indent=1)
print("wrote results.json")
