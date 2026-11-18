"""Milestone 27: the slide as a mechanism (stick-slip on the ledger).

    python experiments/m27_slide_mech/run.py > experiments/m27_slide_mech/results.txt

Needs numpy and mujoco (section A clones MuJoCo Menagerie's G1 and H1 once, as milestone 3b does).
Reads ../m11_measured/profiles.json and ../m6b_bowed_edge/results.json for section E (milestone 12's
grid); writes results.json beside this file. H103-H105 were registered in LOG.md before this script
was run. A few minutes on one CPU.
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
sys.path.insert(0, os.path.join(ROOT, "src"))
for _p in ("buildbot-payload", "buildbot-fasten"):
    sys.path.insert(0, os.path.join(ROOT, "..", _p, "src"))
from buildbot_sheathing import ceiling as Q  # noqa: E402
from buildbot_sheathing import cycle as C  # noqa: E402
from buildbot_sheathing import humanoid as Hm  # noqa: E402
from buildbot_sheathing import measured as M  # noqa: E402
from buildbot_sheathing import slide_mech as S  # noqa: E402
from buildbot_sheathing import straighten as St  # noqa: E402
from buildbot_sheathing.asbuilt import STUD_LEN, U_JOINT  # noqa: E402

T0 = time.time()
MM = 1e-3
MS = 1e-3
TAUS = [2 * MS, 10 * MS, 20 * MS, 50 * MS, 100 * MS]
RATIOS = [0.5, 0.6, 0.8, 0.9]
MU_S = [0.3, 0.4, 0.5, 0.7]
D_DET = 0.1 * MM
FDOT = 200.0
N_LOOP = 2000
out = {"versions": {"python": platform.python_version(), "numpy": np.__version__}}

print("# Milestone 27: the slide as a mechanism, stick-slip on the ledger (buildbot-sheathing)")
print(f"sheet {S.MASS} kg, press F_n {S.F_N:.0f} N, breakaway F_s = mu_s (m g + F_n), sliding F_k = (mu_k/mu_s) F_s; "
      f"push ramps at {FDOT:.0f} N/s, slip seen at {D_DET / MM:.2f} mm, released tau later; push only\n")

# ------------------------------------------------------------------ A. hand stiffness
import mujoco  # noqa: E402
from buildbot_payload import fetch  # noqa: E402

out["versions"]["mujoco"] = mujoco.__version__
print("## A. Hand stiffness along the wall at milestone 3b's press pose (stock Unitree gains, feet planted, point grip)")
print("robot z_m pose | one hand (N/m)  both hands together (N/m)")
POSES = []
for n in fetch.ROBOTS:
    fetch.model_path(n)
    rob, d0 = Hm.robot(n)
    kp = Hm.gains(rob)[6:]
    comp = np.where(kp > 0, 1.0 / np.maximum(kp, 1e-12), 1e6)
    for z in (0.7, 1.0, 1.3):
        ok, why, q, _ = Hm.hold(rob, d0, (0.35, z), [-S.F_N, 0.0, 0.0])
        J, _ = Hm.hand_jacobian(rob, q, "point")
        Cm = (J * comp) @ J.T
        one = 1.0 / Cm[1, 1]
        t = np.array([0, 1.0, 0, 0, 1.0, 0])
        both = float(t @ np.linalg.inv(Cm) @ t)
        POSES.append({"robot": n, "z": z, "pose": why, "one": float(one), "both": both})
        print(f"{n} {z:.1f} {why:5s} | {one:8.0f}  {both:8.0f}")
out["A"] = POSES
K_G1 = [p["one"] for p in POSES if p["robot"] == "g1" and p["z"] == 1.0][0]
print(f"used below: the G1 one hand at z 1.0 m, k = {K_G1:.0f} N/m\n")

# ------------------------------------------------------------------ B. one tap
fs, fk = S.friction(0.4, 0.8)
print(f"## B. One tap, mu_s 0.4, mu_k/mu_s 0.8 (F_s {fs:.1f} N, F_k {fk:.1f} N): travel (mm)")
print("tau_ms | closed form  force source sim | each pose's spring as a ratio to the force source")
print("       |                               | " + "  ".join(f"{p['robot']}{p['z']:.1f}/{h}" for p in POSES for h in ("1", "2")))
out["B"] = []
worst = 0.0
for tau in TAUS:
    cf = S.tap_closed(fs, fk, tau, D_DET, FDOT)
    d0_, _ = S.tap(np.array([fs]), np.array([fk]), tau, D_DET, fdot=FDOT)
    ratios = {}
    for p in POSES:
        for h, kk in (("1", p["one"]), ("2", p["both"])):
            for vr in (True, False):
                d, _ = S.tap(np.array([fs]), np.array([fk]), tau, D_DET, k=kk, fdot=FDOT, vel_ref=vr)
                ratios[f"{p['robot']}{p['z']:.1f}/{h}/{'vref' if vr else 'v0'}"] = float(d[0] / d0_[0])
    worst = max(worst, max(abs(r - 1) for r in ratios.values()))
    out["B"].append({"tau": tau, "closed": cf, "sim": float(d0_[0]), "ratios": ratios})
    vals = [min(ratios[f"{p['robot']}{p['z']:.1f}/{h}/vref"], ratios[f"{p['robot']}{p['z']:.1f}/{h}/v0"])
            for p in POSES for h in ("1", "2")]
    print(f"{tau / MS:6.0f} | {cf / MM:9.3f} {d0_[0] / MM:10.3f}         | " + "  ".join(f"{v:7.3f}" for v in vals))
print(f"largest |spring / force source - 1| over poses, hands, damping variants and tau: {worst:.3f}")
print("(with or without a velocity command the ratios agree to the printed digits; the smaller is shown)\n")

# ------------------------------------------------------------------ C. tap travel by friction
print("## C. One tap's travel (mm, closed form, force source) by friction and reaction time")
print("mu_s ratio | " + " ".join(f"tau {t / MS:3.0f}ms" for t in TAUS))
out["C"] = []
for mu in MU_S:
    for r in RATIOS:
        a, b = S.friction(mu, r)
        row = [S.tap_closed(a, b, t, D_DET, FDOT) for t in TAUS]
        out["C"].append({"mu_s": mu, "ratio": r, "travel": row})
        print(f"{mu:4.1f} {r:5.1f} | " + " ".join(f"{v / MM:9.3f}" for v in row))
print("sensitivity at mu_s 0.4, ratio 0.8, tau 20 ms:")
for dd in (0.05 * MM, 0.1 * MM, 0.2 * MM):
    for fd in (100.0, 200.0, 500.0):
        print(f"  d_det {dd / MM:.2f} mm, ramp {fd:3.0f} N/s: {S.tap_closed(fs, fk, 20 * MS, dd, fd) / MM:.3f} mm")
print()

# ------------------------------------------------------------------ D. the loop
print(f"## D. Fine positioning from either edge (G1 hand, k {K_G1:.0f} N/m), {N_LOOP} sheets starting "
      "U(-3, 3) mm off, breakaway varying 10% tap to tap, stop within max(0.1 mm, half the last tap)")
print("mu_s ratio tau_ms cv | rms residual (mm)  p95 |e| (mm)  max |e|  taps mean  seconds mean")
rng = np.random.default_rng(3)
E0 = rng.uniform(-3 * MM, 3 * MM, N_LOOP)
cells = [(0.4, r, t, 0.1) for r in RATIOS for t in TAUS]
cells += [(mu, 0.8, 20 * MS, 0.1) for mu in (0.3, 0.5, 0.7)] + [(0.4, 0.8, 20 * MS, cv) for cv in (0.0, 0.2)]
out["D"] = []
for mu, r, tau, cv in cells:
    a, b = S.friction(mu, r)
    res = S.loop(E0, np.full(N_LOOP, a), np.full(N_LOOP, b), tau, D_DET, k=K_G1, fdot=FDOT, cv_s=cv)
    e = np.abs(res["e"])
    row = {"mu_s": mu, "ratio": r, "tau": tau, "cv": cv, "rms": S.rms(res["e"]), "p95": float(np.quantile(e, 0.95)),
           "max": float(e.max()), "taps": float(res["taps"].mean()), "seconds": float(res["seconds"].mean())}
    out["D"].append(row)
    print(f"{mu:4.1f} {r:5.1f} {tau / MS:6.0f} {cv:3.1f} | {row['rms'] / MM:10.3f} {row['p95'] / MM:14.3f} "
          f"{row['max'] / MM:9.3f} {row['taps']:9.2f} {row['seconds']:11.2f}")
print()


def dcell(r, tau, mu=0.4, cv=0.1):
    return [c for c in out["D"] if c["mu_s"] == mu and c["ratio"] == r and c["tau"] == tau and c["cv"] == cv][0]


# ------------------------------------------------------------------ E. back into milestone 12
D = json.load(open(os.path.join(HERE, "..", "m11_measured", "profiles.json")))
m6b = json.load(open(os.path.join(HERE, "..", "m6b_bowed_edge", "results.json")))
ROCK = np.radians(np.array(m6b["F_draws"]["drake_deg"]))
MID = St.Straightener("mid", U_JOINT, "pinned", 0.5e-3)
PROF = M.model_profiles(D["members"], "smooth", STUD_LEN)


def stack(slide):
    """Milestone 12's best single-2x stack: measured studs, per-nail reads, mid push, slide and shim."""
    return Q.clean(framing="2x", policy="local", rock_draw=ROCK, straighten=MID, profiles=PROF, warp="straight",
                   trials=20000, seed=7, slide=slide, shim=0.5 * MM)["clean"]


print("## E. Milestone 12's best single-2x stack (measured studs, per-nail reads, mid push, shim 0.5 mm) "
      "with the slide residual from D (Gaussian at D's rms) in place of 0.5 mm")
base = stack(0.5 * MM)
print(f"check: slide 0.5 mm gives {base:.4f} (milestone 12: 0.7707)")
print("ratio tau_ms | slide rms (mm) | clean   [95%]            change (points)")
out["E"] = {"base": base, "rows": []}
for r in RATIOS:
    for tau in TAUS:
        c = dcell(r, tau)
        v = stack(c["rms"])
        lo, hi = C.wilson(v, 20000)
        out["E"]["rows"].append({"ratio": r, "tau": tau, "slide": c["rms"], "clean": v, "lo": lo, "hi": hi})
        print(f"{r:5.1f} {tau / MS:6.0f} | {c['rms'] / MM:13.3f} | {v:.4f} [{lo:.4f}, {hi:.4f}]  {100 * (v - base):+6.2f}")
print()


def ecell(r, tau):
    return [c for c in out["E"]["rows"] if c["ratio"] == r and c["tau"] == tau][0]


# ------------------------------------------------------------------ F. hypotheses
print("## F. Hypotheses (registered in LOG.md before this run)")
h103 = worst <= 0.10
print(f"H103 (stock hand acts as a force source, within 10% at every tau): largest deviation {100 * worst:.1f}% "
      f"-> {'held' if h103 else 'refuted'}")
r104 = dcell(0.8, 100 * MS)["rms"]
h104 = r104 > 0.5 * MM
print(f"H104 (rms residual > 0.5 mm at tau 100 ms, ratio 0.8, mu_s 0.4): {r104 / MM:.3f} mm -> "
      f"{'held' if h104 else 'refuted'}")
e105 = ecell(0.8, 20 * MS)
h105 = (base - e105["clean"]) <= 0.02
print(f"H105 (stack within 2 points of {base:.4f} at tau 20 ms, ratio 0.8): {e105['clean']:.4f} "
      f"({100 * (e105['clean'] - base):+.2f} points) -> {'held' if h105 else 'refuted'}")
out["F"] = {"H103": h103, "H103_worst": worst, "H104": h104, "H104_rms": r104, "H105": h105,
            "H105_clean": e105["clean"]}

json.dump(out, open(os.path.join(HERE, "results.json"), "w"), indent=1)
print(f"\n(run time {time.time() - T0:.0f} s; python {platform.python_version()}, numpy {np.__version__}, "
      f"mujoco {mujoco.__version__})")
