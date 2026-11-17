"""Milestone 30: gear backlash at the nailer's nose, and which joints gravity and the press preload.

A. Geometry: the general tool offset reproduces milestone 29 at zero lateral offset; the sourced axial
   bracket (0.29-0.32 m, Metabo HPT NR90AES1, 12-11/16 in tall) and the handle's lateral offset swept.
B. Static joint torques at milestone 29's pose (MuJoCo Menagerie G1 and H1, feet planted, min-norm
   ground reaction), gravity + the 3.4 kg nailer + a press F at the nose; which joints are held.
C. Check: uniform per-joint backlash draws against the Gaussian tool model, one nail.
D. The best single-2x stack with backlash 0-25 arcmin at 11-14 bits: unpreloaded, preloaded, and
   preloaded with every leg joint counted loose (the ground-reaction split is not determined).
E. The tool-point spec: the largest backlash that keeps the stack at 0.90 and 0.95.
F. Hypotheses H112-H114 (registered in LOG.md before this run).

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

from buildbot_sheathing import backlash as B  # noqa: E402
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
AM = B.ARCMIN
TOOL_KG = 3.4                      # buildbot-fasten: Metabo HPT NR90AES1, 7.5 lb
POSE = (0.4, 1.0)                  # milestone 29's stud-height pose
L0 = 0.30                          # nose behind the grip along the nail; sourced bracket 0.29-0.32 m
GAPS = [0, 1, 3, 5, 7, 10, 17, 25]  # total backlash per joint (arcmin)
BITS = [11, 12, 13, 14]
PRESS = [0, 25, 50, 100]           # press force at firing, upper end F; the range is [F/2, F] (N)
TAU_F = [0.05, 0.2, 0.5]           # holding threshold (N m), not sourced
TRIALS = 20000
out = {"versions": {"python": platform.python_version(), "numpy": np.__version__}, "pose": POSE,
       "tool_kg": TOOL_KG, "L": L0}

print("# Milestone 30: backlash at the nailer's nose, and which joints gravity and the press preload")
print(f"quantisation 1 sigma: " + ", ".join(f"{b} bits {math.degrees(T.quant_sigma(b)) * 60:.3f} arcmin"
                                            for b in BITS)
      + "; a uniform gap of b arcmin adds b/sqrt(12) on a loose joint\n")

import mujoco  # noqa: E402
from buildbot_payload import fetch  # noqa: E402
from buildbot_payload import model as P  # noqa: E402

out["versions"]["mujoco"] = mujoco.__version__
out["menagerie_commit"] = fetch.COMMIT
R, QPOS, JAC, NAMES = {}, {}, {}, {}
for n in fetch.ROBOTS:
    r = P.load(n)
    d0 = P.standing(r)
    R[n] = r
    QPOS[n] = P.pose(r, d0, POSE, TOOL_KG, "palm").qpos
    JAC[n] = T.hand_jacobians(r, d0, POSE, TOOL_KG)
    NAMES[n] = B.joint_names(r)

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


def err(n, bits, gap_am, loose, L=L0, r=(0.0, 0.0)):
    sig = B.joint_sigmas(T.quant_sigma(bits), gap_am * AM, loose)
    return B.from_rows(*JAC[n], sig, L, r)


# ------------------------------------------------------------------ A. geometry
print("## A. Geometry")
ea = B.from_rows(*JAC["g1"], T.quant_sigma(11), 0.3)
eb = T.from_jacobian(*JAC["g1"], T.quant_sigma(11), 0.3)
dev = max(abs(ea.y.s_surf - eb.y.s_surf), abs(ea.y.s_depth - eb.y.s_depth), abs(ea.z.s_surf - eb.z.s_surf),
          abs(ea.z.s_depth - eb.z.s_depth))
print(f"general offset at r = 0 against milestone 29's rows (G1, 11 bits, L 0.3): largest sigma difference "
      f"{dev:.2e} m; y surface {ea.y.s_surf / MM:.3f} mm (milestone 29: 1.312)")
ref11 = stack(ea)
print(f"G1 11-bit stack at L 0.3 through the new rows: {ref11:.4f} (milestone 29: 0.2637)")
out["A"] = {"dev": dev, "ref11": ref11, "axial": [], "lateral": []}
print("axial bracket (r = 0), G1: L (m) | 11 bits | 12 bits")
for L in (0.29, 0.30, 0.32):
    v11 = stack(err("g1", 11, 0, np.zeros(29, bool), L))
    v12 = stack(err("g1", 12, 0, np.zeros(29, bool), L))
    out["A"]["axial"].append({"L": L, "b11": v11, "b12": v12})
    print(f"  {L:.2f} | {v11:.4f} | {v12:.4f}")
print("handle offset from the drive axis, L 0.3 m: robot dir r (m) | y surf (mm) z surf (mm) | 11 bits (pts vs r 0) | 12 bits")
base12 = {}
for n in R:
    nj = len(NAMES[n])
    base12[n] = stack(err(n, 12, 0, np.zeros(nj, bool)))
    b11 = ref11 if n == "g1" else stack(err(n, 11, 0, np.zeros(nj, bool)))
    for dname, unit in (("up", (0.0, 1.0)), ("down", (0.0, -1.0)), ("side", (1.0, 0.0))):
        for rr in (0.05, 0.10, 0.15, 0.20):
            rv = (unit[0] * rr, unit[1] * rr)
            e11 = err(n, 11, 0, np.zeros(nj, bool), r=rv)
            v11 = stack(e11)
            v12 = stack(err(n, 12, 0, np.zeros(nj, bool), r=rv))
            out["A"]["lateral"].append({"robot": n, "dir": dname, "r": rr, "b11": v11, "b12": v12, "ref11": b11,
                                        "ref12": base12[n], "y": e11.y.s_surf, "z": e11.z.s_surf})
            print(f"  {n:3s} {dname:4s} {rr:.2f} | {e11.y.s_surf / MM:.3f} {e11.z.s_surf / MM:.3f} | {v11:.4f} "
                  f"({100 * (v11 - b11):+.2f}) | {v12:.4f} ({100 * (v12 - base12[n]):+.2f})")
print()

# ------------------------------------------------------------------ B. torques and held joints
print("## B. Static joint torques at the pose (N m): gravity + nailer, and at a 50 N press")
out["B"] = {"tau": {}, "held": []}
TAU = {}
for n in R:
    TAU[n] = {F: B.static_torques(R[n], QPOS[n], TOOL_KG, F, (L0, 0, 0)) for F in (0, 12.5, 25, 50, 100)}
    out["B"]["tau"][n] = {str(F): TAU[n][F].tolist() for F in TAU[n]}
    jp, jr = JAC[n]
    rows = B.tool_rows(jp, jr, (L0, 0, 0))
    infl = np.hypot(rows[1], rows[2])
    print(f"{n}: joint | tau F 0 | tau F 50 | nose motion per rad (m, |y,z|)")
    for k, nm in enumerate(NAMES[n]):
        if infl[k] < 1e-6:
            continue
        print(f"  {nm:28s} {TAU[n][0][k]:8.2f} {TAU[n][50][k]:8.2f}   {infl[k]:.3f}")
print("(left-arm joints do not move the right hand and are left out)")
print("\nheld joints (of those that move the nose): torque one sign over the press range [F/2, F] and |tau| >= tau_f")
print("robot F (N) tau_f | held / moving | loose joints")
LEGS = {n: np.array([("hip" in s or "knee" in s or "ankle" in s) for s in NAMES[n]]) for n in R}


ANKLE_ROLL = {n: np.array([("ankle_roll" in s) for s in NAMES[n]]) for n in R}


def loose_mask(n, F, tau_f, legs_loose=False):
    if F == 0:
        lo = hi = TAU[n][0]
    else:
        lo, hi = TAU[n][F / 2], TAU[n][F]
    m = ~B.held(lo, hi, tau_f)
    return (m | LEGS[n]) if legs_loose else m


for n in R:
    jp, jr = JAC[n]
    rows = B.tool_rows(jp, jr, (L0, 0, 0))
    moving = np.hypot(rows[1], rows[2]) > 1e-6
    for F in PRESS:
        for tf in TAU_F:
            lm = loose_mask(n, F, tf)
            names = [NAMES[n][k] for k in np.flatnonzero(lm & moving)]
            out["B"]["held"].append({"robot": n, "F": F, "tau_f": tf, "held": int((~lm & moving).sum()),
                                     "moving": int(moving.sum()), "loose": names})
            short = ", ".join(s.replace("_joint", "") for s in names)
            print(f"  {n:3s} {F:4d} {tf:4.2f} | {int((~lm & moving).sum()):2d} / {int(moving.sum()):2d} | {short}")
print()

# ------------------------------------------------------------------ C. uniform against Gaussian
print("## C. Check: uniform backlash draws against the Gaussian model, one nail, G1 12 bits, 5 arcmin, all loose")
nj = len(NAMES["g1"])
eC = err("g1", 12, 5, np.ones(nj, bool))
out["C"] = []
for lo, hi in ((-1 * MM, 1 * MM), (-0.5 * MM, 1.5 * MM), (-2 * MM, 0.6 * MM)):
    u = B.p_window_uniform(lo, hi, *JAC["g1"], T.quant_sigma(12), 5 * AM, np.ones(nj, bool), L0)
    g = T.p_window_exact(lo, hi, eC.y)
    out["C"].append({"lo": lo, "hi": hi, "uniform": u, "gauss": g})
    print(f"  surface >= {lo / MM:+.1f} mm, depth <= {hi / MM:+.1f} mm: uniform Monte Carlo {u:.4f} (200,000), "
          f"Gaussian {g:.4f}")
print()

# ------------------------------------------------------------------ D. the stack with backlash
MODES = {"unpreloaded": lambda n: np.ones(len(NAMES[n]), bool),
         "preloaded": lambda n: loose_mask(n, 50, 0.2),
         "preloaded, legs loose": lambda n: loose_mask(n, 50, 0.2, True),
         "preloaded, ankle rolls biased": lambda n: loose_mask(n, 50, 0.2) & ~ANKLE_ROLL[n]}
print("## D. Best single-2x stack with backlash (L 0.3 m; preloaded: press 25-50 N, tau_f 0.2 N m)")
out["D"] = []
for n in R:
    for mode, fm in MODES.items():
        if n == "h1" and mode.endswith("biased"):
            continue                     # the H1 has no ankle roll joint
        lm = fm(n)
        print(f"{n} {mode}: gap (arcmin) | " + " | ".join(f"{b} bits" for b in BITS))
        for g in GAPS:
            vals = []
            for b in BITS:
                if n == "h1" and b not in (11, 12):
                    vals.append(None)
                    continue
                e = err(n, b, g, lm)
                v = stack(e)
                vals.append(v)
                out["D"].append({"robot": n, "mode": mode, "gap": g, "bits": b, "clean": v, "y": e.y.s_surf,
                                 "z": e.z.s_surf})
            print(f"  {g:4d} | " + " | ".join("   -  " if v is None else f"{v:.4f}" for v in vals))
print()


def drow(n, mode, g, b):
    return [x for x in out["D"] if x["robot"] == n and x["mode"] == mode and x["gap"] == g and x["bits"] == b][0]


# ------------------------------------------------------------------ E. the spec
print("## E. Tool-point spec, G1 at L 0.3 m: the largest backlash (arcmin) that keeps the single-2x stack at")
print("mode | bits | 0.90 | 0.95   (0 = the bits alone miss it; > 60 = not binding below a degree)")
out["E"] = []


def max_gap(lm, bits, target):
    if stack(err("g1", bits, 0, lm)) < target:
        return 0.0
    if stack(err("g1", bits, 60, lm)) >= target:
        return float("inf")
    lo, hi = 0.0, 60.0
    for _ in range(10):
        mid = (lo + hi) / 2
        if stack(err("g1", bits, mid, lm)) >= target:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


for mode, fm in MODES.items():
    lm = fm("g1")
    for b in (12, 13, 14):
        g90, g95 = max_gap(lm, b, 0.90), max_gap(lm, b, 0.95)
        out["E"].append({"mode": mode, "bits": b, "g90": None if g90 == float("inf") else g90,
                         "g95": None if g95 == float("inf") else g95})
        f = lambda x: "> 60" if x == float("inf") else f"{x:.2f}"  # noqa: E731
        print(f"  {mode:22s} | {b} | {f(g90)} | {f(g95)}")
print()

# ------------------------------------------------------------------ F. hypotheses
print("## F. Hypotheses (registered in LOG.md before this run)")
v0 = drow("g1", "unpreloaded", 0, 12)["clean"]
v5 = drow("g1", "unpreloaded", 5, 12)["clean"]
h112 = (v0 - v5) > 0.05
print(f"H112 (5 arcmin on every G1 joint, unpreloaded, costs the 12-bit G1 > 5 points): {v5:.4f} against {v0:.4f} "
      f"({100 * (v5 - v0):+.2f}) -> {'held' if h112 else 'refuted'}")
losses = {}
for F in (25, 50):
    lm = loose_mask("g1", F, 0.2)
    eF = err("g1", 12, 5, lm)
    losses[F] = v0 - stack(eF)
    print(f"  press {F} N: loose " + ", ".join(NAMES["g1"][k].replace("_joint", "") for k in np.flatnonzero(lm))
          + f"; along-wall sigma surface {eF.y.s_surf / MM:.4f} mm (no backlash {drow('g1', 'unpreloaded', 0, 12)['y'] / MM:.4f})")
h113 = max(losses.values()) <= 0.02
print(f"H113 (preloaded, press 25-50 N, tau_f 0.2: the same 5 arcmin costs <= 2 points): losses "
      + ", ".join(f"F {F} N {100 * x:.2f}" for F, x in losses.items())
      + f" points -> {'held' if h113 else 'refuted'}")
lat = [x for x in out["A"]["lateral"] if x["robot"] == "g1" and x["r"] == 0.15 and x["dir"] != "down"]
worst = max(abs(x["b11"] - x["ref11"]) for x in lat)
h114 = worst < 0.02
print(f"H114 (a 0.15 m handle offset moves the 11-bit G1 stack < 2 points): worst "
      + ", ".join(f"{x['dir']} {100 * (x['b11'] - x['ref11']):+.2f}" for x in lat)
      + f" -> {'held' if h114 else 'refuted'} (registered on up and side; down, not registered: "
      + f"{100 * ([x for x in out['A']['lateral'] if x['robot'] == 'g1' and x['r'] == 0.15 and x['dir'] == 'down'][0]['b11'] - ref11):+.2f})")
out["F"] = {"H112": h112, "H112_v0": v0, "H112_v5": v5, "H113": h113, "H113_losses": losses, "H114": h114,
            "H114_worst": worst}

json.dump(out, open(os.path.join(HERE, "results.json"), "w"), indent=1)
print(f"\n(run time {time.time() - T0:.0f} s; python {platform.python_version()}, numpy {np.__version__}, "
      f"mujoco {mujoco.__version__})")
