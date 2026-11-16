"""Milestone 29: the nailer's length and the nail's lean (buildbot-sheathing).

A. The G1's and H1's hand Jacobians (MuJoCo Menagerie, feet planted, buildbot-fasten's pose and tool
   mass) carried to the nailer's nose at length L and to the shank 44.4 mm into the wall.
B. Checks: the L = 0 surface sigma reproduces buildbot-fasten's 0.93/0.87 mm; a one-nail Monte Carlo
   of the correlated draw matches the bivariate normal; the old point model through the new code path
   matches the old path within Monte Carlo error.
C. Milestone 28's best single-2x stack and the doubled-joint pipeline with the robot's tool error at
   each L and joint error 1, 2, 4 x the 11-bit quantisation.
D. An independent nail lean swept 0 to 3 deg (1 sigma), and the lean the stack tolerates for 2 points.
E. Hypotheses H109-H111 (registered in LOG.md before this run).

Reads ../m11_measured/profiles.json, ../m6b_bowed_edge/results.json and ../m27_slide_mech/results.json.
"""
import json
import math
import os
import platform
import sys
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
sys.path[:0] = [os.path.join(ROOT, "src"), os.path.join(ROOT, "..", "buildbot-payload", "src"),
                os.path.join(ROOT, "..", "buildbot-fasten", "src")]

from buildbot_sheathing import ceiling as Q  # noqa: E402
from buildbot_sheathing import cycle as C  # noqa: E402
from buildbot_sheathing import measured as M  # noqa: E402
from buildbot_sheathing import shim_mech as W  # noqa: E402
from buildbot_sheathing import straighten as St  # noqa: E402
from buildbot_sheathing import tool_lean as T  # noqa: E402
from buildbot_sheathing.asbuilt import STUD_LEN, U_JOINT  # noqa: E402

T0 = time.time()
MM = 1e-3
MS = 1e-3
DEG = math.pi / 180
TOOL_KG = 3.4                      # buildbot-fasten: Metabo HPT NR90AES1, 7.5 lb
POSE = (0.4, 1.0)                  # buildbot-fasten's stud-height pose (hand reach x, height z)
LS = [0.0, 0.15, 0.3, 0.45]        # nose ahead of the grip (m); buildbot-fasten uses 0.3, not sourced
MULT = [1, 2, 4]                   # joint error as multiples of 11-bit quantisation
LEANS = [0.0, 0.25, 0.5, 1.0, 2.0, 3.0]
TRIALS = 20000
out = {"versions": {"python": platform.python_version(), "numpy": np.__version__},
       "depth_check_mm": T.DEPTH_CHECK / MM, "pose": POSE, "tool_kg": TOOL_KG}

print("# Milestone 29: the nailer's length and the nail's lean (buildbot-sheathing)")
print(f"member bound checked {T.DEPTH_CHECK / MM:.1f} mm below the surface (7/16 in OSB + 10 x 0.131 in); "
      f"11-bit joint error {T.quant_sigma(11) / DEG:.4f} deg (1 sigma)\n")

# ------------------------------------------------------------------ A. the robots' tool error
import mujoco  # noqa: E402
from buildbot_payload import fetch  # noqa: E402
from buildbot_payload import model as P  # noqa: E402

out["versions"]["mujoco"] = mujoco.__version__
out["menagerie_commit"] = fetch.COMMIT
print("## A. Tool error at the stud-height pose (hand x 0.4, z 1.0 m), 11-bit joints, feet planted")
print("robot | hand rotation sigma x/y/z (deg) | L (m) | y: surface  depth  rho | z: surface  depth  rho  (mm)")
JAC = {}
out["A"] = []
for n in fetch.ROBOTS:
    r = P.load(n)
    d0 = P.standing(r)
    jp, jr = T.hand_jacobians(r, d0, POSE, TOOL_KG)
    JAC[n] = (jp, jr)
    sq = T.quant_sigma(11)
    rot = [sq * float(np.linalg.norm(jr[i])) / DEG for i in range(3)]
    for L in LS:
        e = T.from_jacobian(jp, jr, sq, L)
        row = {"robot": n, "L": L, "rot_deg": rot, "y": vars(e.y), "z": vars(e.z)}
        out["A"].append(row)
        print(f"{n:5s} | {rot[0]:.3f} {rot[1]:.3f} {rot[2]:.3f}            | {L:5.2f} | "
              f"{e.y.s_surf / MM:10.3f} {e.y.s_depth / MM:6.3f} {e.y.rho:5.3f} | "
              f"{e.z.s_surf / MM:10.3f} {e.z.s_depth / MM:6.3f} {e.z.rho:5.3f}")
print("lean a joint error gives at the nose: y "
      + ", ".join(f"{n} {T.quant_sigma(11) * float(np.linalg.norm(JAC[n][1][2])) / DEG:.3f} deg" for n in JAC)
      + " (rotation about z tilts the nail along the wall)\n")


def arow(n, L):
    return [a for a in out["A"] if a["robot"] == n and a["L"] == L][0]


# ------------------------------------------------------------------ B. checks
print("## B. Checks")
a0 = arow("g1", 0.0)
print(f"buildbot-fasten's 11-bit G1 hand point: 0.93/0.87 mm (y/z); here L 0 surface {a0['y']['s_surf'] / MM:.3f}/"
      f"{a0['z']['s_surf'] / MM:.3f} mm")
e3 = T.from_jacobian(*JAC["g1"], T.quant_sigma(11), 0.3)
out["B"] = {"fasten_y": a0["y"]["s_surf"], "fasten_z": a0["z"]["s_surf"], "one_nail": []}
for lo, hi in ((-2 * MM, 2 * MM), (-1 * MM, 1.5 * MM), (-3 * MM, 0.8 * MM)):
    mc = T.p_window(lo, hi, e3)
    ex = T.p_window_exact(lo, hi, e3.y)
    out["B"]["one_nail"].append({"lo": lo, "hi": hi, "mc": mc, "exact": ex})
    print(f"one nail, window surface >= {lo / MM:+.1f} mm and depth <= {hi / MM:+.1f} mm: Monte Carlo {mc:.4f} "
          f"(400,000), bivariate normal {ex:.4f}")

D = json.load(open(os.path.join(HERE, "..", "m11_measured", "profiles.json")))
MID = St.Straightener("mid", U_JOINT, "pinned", 0.5e-3)
PROF = M.model_profiles(D["members"], "smooth", STUD_LEN)
m6b = json.load(open(os.path.join(HERE, "..", "m6b_bowed_edge", "results.json")))
ROCK = np.radians(np.array(m6b["F_draws"]["drake_deg"]))
m27 = json.load(open(os.path.join(HERE, "..", "m27_slide_mech", "results.json")))
SLIDE20 = [c for c in m27["D"] if c["mu_s"] == 0.4 and c["ratio"] == 0.8 and c["tau"] == 20 * MS
           and c["cv"] == 0.1][0]["rms"]
SHIM16 = lambda h: W.stack_residual(h, W.STEP_STACK)  # noqa: E731


def stack(tool=None, framing="2x"):
    return Q.clean(framing=framing, policy="local", rock_draw=ROCK, straighten=MID, profiles=PROF,
                   warp="straight", trials=TRIALS, seed=7, slide=SLIDE20, shim=SHIM16, tool=tool)["clean"]


base = stack()
print(f"best single-2x stack, old path (0.9 mm hand point): {base:.4f} (milestone 28: 0.7964)")
pm = stack(T.point_model(C.S_ROBOT))
lo_, hi_ = C.wilson(base, TRIALS)
print(f"the same point model through the new path (other random draws): {pm:.4f}; old path's 95% interval "
      f"[{lo_:.4f}, {hi_:.4f}]")
base2 = stack(framing="2x2x")
print(f"doubled joint studs, old path: {base2:.4f}\n")
out["B"].update({"stack_old": base, "stack_point_new": pm, "doubled_old": base2})

# ------------------------------------------------------------------ C. the robots' error in the stack
print("## C. The stack with each robot's tool error (11-bit x multiple, nailer length L)")
print("robot mult L (m) | single 2x  [95%]           vs 0.9 mm point (pts) | doubled")
out["C"] = []
for n in JAC:
    for k in MULT:
        for L in LS:
            if n == "h1" and k != 1:
                continue
            e = T.from_jacobian(*JAC[n], k * T.quant_sigma(11), L)
            v = stack(e)
            v2 = stack(e, "2x2x") if (L in (0.0, 0.3)) else None
            lo, hi = C.wilson(v, TRIALS)
            row = {"robot": n, "mult": k, "L": L, "clean": v, "lo": lo, "hi": hi, "delta": v - base, "doubled": v2,
                   "s_y_surf": e.y.s_surf, "s_y_depth": e.y.s_depth}
            out["C"].append(row)
            print(f"{n:5s} {k:4d} {L:5.2f} | {v:.4f} [{lo:.4f}, {hi:.4f}] {100 * (v - base):+20.2f} | "
                  f"{'' if v2 is None else f'{v2:.4f}'}")
print()


print("old path, the 0.9 mm point model at other scatters (for scale): " + ", ".join(
    f"{s_:.2f} mm {Q.clean(framing='2x', policy='local', rock_draw=ROCK, straighten=MID, profiles=PROF, warp='straight', trials=TRIALS, seed=7, slide=SLIDE20, shim=SHIM16, s_robot=s_ * MM)['clean']:.4f}"
    for s_ in (0.6, 1.0, 1.3)))
print("\nG1 at L 0.3 m by joint-sensor resolution (quantisation only): what a nailer this long needs")
print("bits | y surface/depth (mm) | single 2x  missed nails a sheet | doubled")
out["C_bits"] = []
for bits in (11, 12, 13, 14):
    e = T.from_jacobian(*JAC["g1"], T.quant_sigma(bits), 0.3)
    r_ = Q.clean(framing="2x", policy="local", rock_draw=ROCK, straighten=MID, profiles=PROF, warp="straight",
                 trials=TRIALS, seed=7, slide=SLIDE20, shim=SHIM16, tool=e)
    v2 = stack(e, "2x2x")
    out["C_bits"].append({"bits": bits, "s_y_surf": e.y.s_surf, "s_y_depth": e.y.s_depth, "clean": r_["clean"],
                          "missed": r_["missed"], "doubled": v2})
    print(f"{bits:4d} | {e.y.s_surf / MM:.3f} / {e.y.s_depth / MM:.3f}        | {r_['clean']:.4f}     {r_['missed']:.3f}"
          f"              | {v2:.4f}")
print()


def crow(n, k, L):
    return [c for c in out["C"] if c["robot"] == n and c["mult"] == k and c["L"] == L][0]


# ------------------------------------------------------------------ D. an independent lean
G1 = T.from_jacobian(*JAC["g1"], T.quant_sigma(11), 0.3)
ref = crow("g1", 1, 0.3)["clean"]
print("## D. An independent nail lean (1 sigma, each axis) on top of the G1's 11-bit error at L 0.3 m")
print(f"lean (deg) | offset at {T.DEPTH_CHECK / MM:.1f} mm (1 sigma, mm) | single 2x  vs no lean (pts) | doubled")
out["D"] = {"ref": ref, "rows": []}
for a in LEANS:
    e = G1.with_lean(a * DEG)
    v = stack(e) if a > 0 else ref
    v2 = stack(e, "2x2x")
    out["D"]["rows"].append({"lean_deg": a, "clean": v, "delta": v - ref, "doubled": v2})
    print(f"{a:10.2f} | {T.DEPTH_CHECK * math.tan(a * DEG) / MM:33.3f} | {v:.4f} {100 * (v - ref):+15.2f} | {v2:.4f}")
# lean the stack tolerates for 2 points: bisection (fixed seed, 12 steps)
lo_a, hi_a = 0.0, 1.0
for _ in range(12):
    mid = (lo_a + hi_a) / 2
    if ref - stack(G1.with_lean(mid * DEG)) <= 0.02:
        lo_a = mid
    else:
        hi_a = mid
tol = (lo_a + hi_a) / 2
out["D"]["tolerance_2pt_deg"] = tol
print(f"lean the single-2x stack tolerates for a 2-point loss: {tol:.3f} deg (1 sigma; "
      f"{T.DEPTH_CHECK * math.tan(tol * DEG) / MM:.3f} mm at depth)\n")

# ------------------------------------------------------------------ E. hypotheses
print("## E. Hypotheses (registered in LOG.md before this run)")
v109 = crow("g1", 1, 0.3)["clean"]
h109 = (base - v109) > 0.02
print(f"H109 (G1 11-bit at a 0.3 m nose and 44 mm depth loses > 2 points against the 0.9 mm point): "
      f"{v109:.4f} against {base:.4f} ({100 * (v109 - base):+.2f} points) -> {'held' if h109 else 'refuted'}")
d1 = [r for r in out["D"]["rows"] if r["lean_deg"] == 1.0][0]
h110 = -d1["delta"] > 0.05
print(f"H110 (a 1 deg lean costs > 5 points): {d1['clean']:.4f} against {ref:.4f} ({100 * d1['delta']:+.2f} points) "
      f"-> {'held' if h110 else 'refuted'}")
d2 = [r for r in out["D"]["rows"] if r["lean_deg"] == 2.0][0]
h111 = d2["doubled"] >= 0.99
print(f"H111 (doubled joints >= 0.99 at a 2 deg lean): {d2['doubled']:.4f} -> {'held' if h111 else 'refuted'}")
out["E"] = {"H109": h109, "H109_clean": v109, "H109_ref": base, "H110": h110, "H110_clean": d1["clean"],
            "H110_ref": ref, "H111": h111, "H111_doubled": d2["doubled"]}

json.dump(out, open(os.path.join(HERE, "results.json"), "w"), indent=1)
print(f"\n(run time {time.time() - T0:.0f} s; python {platform.python_version()}, numpy {np.__version__}, "
      f"mujoco {mujoco.__version__})")
