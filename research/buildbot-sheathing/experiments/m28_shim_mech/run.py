"""Milestone 28: the shim as a mechanism (a shim stack or a driven wedge under the low corner).

    python experiments/m28_shim_mech/run.py > experiments/m28_shim_mech/results.txt

Needs numpy and mujoco (section C and D clone MuJoCo Menagerie's G1 and H1 once, as milestone 3b
does). Reads ../m11_measured/profiles.json, ../m6b_bowed_edge/results.json and
../m27_slide_mech/results.json; writes results.json beside this file. H106-H108 were registered in
LOG.md before this script was run. A few minutes on one CPU.
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
from buildbot_sheathing import bowed_edge as B  # noqa: E402
from buildbot_sheathing import ceiling as Q  # noqa: E402
from buildbot_sheathing import cycle as C  # noqa: E402
from buildbot_sheathing import humanoid as Hm  # noqa: E402
from buildbot_sheathing import ledger as L  # noqa: E402
from buildbot_sheathing import measured as M  # noqa: E402
from buildbot_sheathing import shim_mech as W  # noqa: E402
from buildbot_sheathing import slide_mech as S  # noqa: E402
from buildbot_sheathing import straighten as St  # noqa: E402
from buildbot_sheathing.asbuilt import STUD_LEN, U_JOINT  # noqa: E402

T0 = time.time()
MM = 1e-3
MS = 1e-3
IN = L.IN
TAUS = [2 * MS, 10 * MS, 20 * MS, 50 * MS, 100 * MS]
MUS = [0.2, 0.3, 0.4, 0.5, 0.6]
RHOS = [0.0, 0.5, 1.0]
ZS = [0.35, 0.5, 0.7]
D_DET = 0.1 * MM
FDOT = 200.0
N = 2000
out = {"versions": {"python": platform.python_version(), "numpy": np.__version__}}

m6b = json.load(open(os.path.join(HERE, "..", "m6b_bowed_edge", "results.json")))
ROCK = np.radians(np.array(m6b["F_draws"]["drake_deg"]))
m27 = json.load(open(os.path.join(HERE, "..", "m27_slide_mech", "results.json")))
SLIDE20 = [c for c in m27["D"] if c["mu_s"] == 0.4 and c["ratio"] == 0.8 and c["tau"] == 20 * MS
           and c["cv"] == 0.1][0]["rms"]

print("# Milestone 28: the shim as a mechanism, a shim stack or a driven wedge (buildbot-sheathing)")
print(f"sheet {W.MASS} kg, {W.W / IN:.0f} x {W.H / IN:.0f} in, turning about its high bottom corner; wedge "
      f"{W.WEDGE_LEN / IN:.0f} in long, {W.WEDGE_T[0] / IN:.4f} to {W.WEDGE_T[1] / IN:.4f} in (slope 1:{1 / W.SLOPE:.0f}); "
      f"stack step {W.STEP_STACK / IN:.4f} in ({W.STEP_STACK / MM:.3f} mm); press F_n {S.F_N:.0f} N\n")

# ------------------------------------------------------------------ A. the lift needed
print("## A. Corner lift that plumbs a seated sheet (mm): |ledger tilt + panel tilt| x W, 200,000 draws")
rng = np.random.default_rng(11)
nA = 200000
tilt_flat = L.panel_tilt(rng, nA) + L.ledger_tilt(rng, nA)
tilt_rock = B.panel_tilt(rng, nA, ROCK) + L.ledger_tilt(rng, nA)
out["A"] = {}
print("panel draw          | mean   median  p90    p99    max    share below half a 1/16 in step")
for name, t in (("PS 2 bow (m5)", tilt_flat), ("Drake rock (m6b)", tilt_rock)):
    h = W.lift_needed(t)
    q = np.quantile(h, [0.5, 0.9, 0.99])
    below = float(np.mean(h < W.STEP_STACK / 2))
    out["A"][name] = {"mean": float(h.mean()), "p50": float(q[0]), "p90": float(q[1]), "p99": float(q[2]),
                      "max": float(h.max()), "below_half_step": below}
    print(f"{name:19s} | {h.mean() / MM:5.3f}  {q[0] / MM:5.3f}  {q[1] / MM:5.3f}  {q[2] / MM:5.3f}  "
          f"{h.max() / MM:5.3f}  {below:.3f}")
H_ROCK = W.lift_needed(tilt_rock)
print()

# ------------------------------------------------------------------ B. shim stack
print("## B. Height left by a shim stack: the lift rounded to whole steps (the rock draws of A)")
print("step               | rms (mm)  step/sqrt12 (mm)  p95 |e| (mm)  max |e| (mm)")
out["B"] = []
for name, step in (("1/32 in (shim stock)", IN / 32), ("1/16 in (horseshoe)", IN / 16), ("1/8 in (horseshoe)", IN / 8)):
    e = W.stack_residual(H_ROCK, step)
    r = S.rms(e)
    out["B"].append({"name": name, "step": step, "rms": r, "p95": float(np.quantile(np.abs(e), 0.95)),
                     "max": float(np.abs(e).max())})
    print(f"{name:18s} | {r / MM:8.3f}  {step / math.sqrt(12) / MM:16.3f}  {out['B'][-1]['p95'] / MM:12.3f}  "
          f"{out['B'][-1]['max'] / MM:11.3f}")
print("(lifts under half a step get no shim and leave the lift itself, which lies in the same +/- half-step band,\n"
      " so the rms matches step / sqrt 12)\n")

# ------------------------------------------------------------------ C. wedge statics and the robots
print("## C. Driving the wedge (quasi-static, every face at mu; press F_n at rho x W from the pivot)")
print("mu   rho | load V (N)  push in (N)  H into wall (N) | back out (N, - = pull)  self-locking")
out["C"] = {"rows": []}
for mu in MUS:
    for rho in RHOS:
        fi = W.wedge_force(1, mu, mu, mu, rho=rho)
        fo = W.wedge_force(-1, mu, mu, mu, rho=rho)
        row = {"mu": mu, "rho": rho, "V": fi["V"], "P_in": fi["P"], "H": fi["H"], "P_out": fo["P"],
               "locks": fo["P"] < 0}
        out["C"]["rows"].append(row)
        print(f"{mu:3.1f} {rho:4.1f} | {fi['V']:9.1f}  {fi['P']:10.1f}  {fi['H']:14.1f} | {fo['P']:20.1f}  "
              f"{'yes' if row['locks'] else 'no'}")
fm = W.wedge_force(1, 0.4, 0.15, 0.4)
print(f"a low-friction ledger face (mu2 0.15, others 0.4, rho 0.5): push in {fm['P']:.1f} N")
out["C"]["low_mu2"] = fm["P"]

import mujoco  # noqa: E402
from buildbot_payload import fetch  # noqa: E402

out["versions"]["mujoco"] = mujoco.__version__
print("\nStock robots at the wedge (hands at x 0.35 m, both hands pushing into the wall, milestone 3b's "
      "whole-body check: joint torque limits, foot slip at 0.6, feet planted)")
print("robot z_m | largest push (N)  limit          | one hand's effective mass (kg) | largest mu it can drive (rho 0.5)")
out["C"]["robots"] = []
for n in fetch.ROBOTS:
    fetch.model_path(n)
    rob, d0 = Hm.robot(n)
    for z in ZS:
        fmax, why = Hm.max_press(rob, d0, (0.35, z))
        ok, w2, q, _ = Hm.hold(rob, d0, (0.35, z), [0.0, 0.0, 0.0])
        me = W.effective_mass(rob, q, 1) if ok else None
        mud = W.mu_drivable(fmax) if fmax is not None else None
        out["C"]["robots"].append({"robot": n, "z": z, "push": fmax, "limit": why, "m_eff": me, "mu_max": mud})
        print(f"{n:5s} {z:4.2f} | {fmax if fmax is not None else float('nan'):15.1f}  {why:14s} | "
              f"{me if me is not None else float('nan'):30.3f} | {mud if mud is not None else float('nan'):.3f}")
print(f"(the sheet's turning inertia adds {W.reflected_mass() * 1000:.0f} g along the wedge's travel)\n")


def robot_row(n, z):
    return [r for r in out["C"]["robots"] if r["robot"] == n and r["z"] == z][0]


# ------------------------------------------------------------------ D. the wedge loop
print(f"## D. Setting the height with the wedge: {N} sheets from A's rock draws, both corners on wedges and the low "
      "one driven; taps in or out until within max(0.02 mm, half the last tap); breakaway varies 10% a tap")
STROKE = W.WEDGE_LEN
print(f"robot mu_s ratio tau_ms | one tap: travel (mm) lift (mm) | rms height left (mm)  p95 |e| (mm)  taps mean  p95  "
      f"capped | note")
E0 = -H_ROCK[:N]
out["D"] = []
cells = [("g1", 0.4, r, t) for r in (0.5, 0.8, 0.9) for t in TAUS]
cells += [("h1", 0.4, 0.8, t) for t in TAUS] + [("g1", mu, 0.8, 20 * MS) for mu in (0.2, 0.3, 0.6)]
for rb, mu, ratio, tau in cells:
    mass = robot_row(rb, 0.5)["m_eff"] + W.reflected_mass()
    f = W.wedge_taps(mu, ratio)
    one = S.tap_closed(f["in"][0], f["in"][1], tau, D_DET, FDOT, mass)
    res = W.wedge_loop(E0, f, tau, D_DET, mass, fdot=FDOT)
    e = np.abs(res["e"])
    row = {"robot": rb, "mu_s": mu, "ratio": ratio, "tau": tau, "mass": mass, "tap_in": one, "rms": S.rms(res["e"]),
           "p95": float(np.quantile(e, 0.95)), "taps": float(res["taps"].mean()),
           "taps_p95": float(np.quantile(res["taps"], 0.95)), "capped": float(res["capped"].mean()),
           "overruns": bool(one > STROKE / 2)}
    out["D"].append(row)
    note = "one tap > half the wedge's 8 in: not feasible" if row["overruns"] else ""
    print(f"{rb:5s} {mu:4.1f} {ratio:5.1f} {tau / MS:6.0f} | {one / MM:19.2f} {one * W.SLOPE / MM:9.3f} | "
          f"{row['rms'] / MM:19.3f}  {row['p95'] / MM:12.3f}  {row['taps']:9.2f}  {row['taps_p95']:4.0f}  "
          f"{row['capped']:6.3f} | {note}")
print("sensitivity, G1, mu_s 0.4, ratio 0.8, tau 20 ms: one tap's travel (mm) by detection threshold and ramp")
g1m = robot_row("g1", 0.5)["m_eff"] + W.reflected_mass()
f48 = W.wedge_taps(0.4, 0.8)
for dd in (0.05 * MM, 0.1 * MM, 0.2 * MM):
    print("  d_det %.2f mm: " % (dd / MM) + "  ".join(
        f"ramp {fd:3.0f} N/s {S.tap_closed(f48['in'][0], f48['in'][1], 20 * MS, dd, fd, g1m) / MM:6.2f}"
        for fd in (100.0, 200.0, 500.0)))
print()


def dcell(rb, ratio, tau, mu=0.4):
    return [c for c in out["D"] if c["robot"] == rb and c["mu_s"] == mu and c["ratio"] == ratio and c["tau"] == tau][0]


# ------------------------------------------------------------------ E. back into milestone 12
D = json.load(open(os.path.join(HERE, "..", "m11_measured", "profiles.json")))
MID = St.Straightener("mid", U_JOINT, "pinned", 0.5e-3)
PROF = M.model_profiles(D["members"], "smooth", STUD_LEN)


def stack(slide, shim):
    return Q.clean(framing="2x", policy="local", rock_draw=ROCK, straighten=MID, profiles=PROF, warp="straight",
                   trials=20000, seed=7, slide=slide, shim=shim)["clean"]


print("## E. Milestone 12's best single-2x stack (measured studs, per-nail reads, mid push) by shim mechanism")
base = stack(0.5 * MM, 0.5 * MM)
print(f"check: slide 0.5 mm, shim 0.5 mm gives {base:.4f} (milestone 12: 0.7707)")
print(f"slide below: milestone 27's loop at 20 ms, mu_s 0.4, ratio 0.8, rms {SLIDE20 / MM:.3f} mm")
rows = [("shim 0.5 mm (assumed)", 0.5 * MM), ("no shim residual", 0.0)]
for b in out["B"]:
    st = b["step"]
    rows.append((f"stack {b['name']}", (lambda s_: (lambda h: W.stack_residual(h, s_)))(st)))
    rows.append((f"stack {b['name']} as Gaussian", b["rms"]))
for rb, tau in (("g1", 20 * MS), ("g1", 50 * MS), ("g1", 100 * MS), ("h1", 20 * MS)):
    rows.append((f"wedge {rb} {tau / MS:.0f} ms (Gaussian at D's rms)", dcell(rb, 0.8, tau)["rms"]))
out["E"] = {"base": base, "slide": SLIDE20, "rows": []}
print("shim                                    | clean   [95%]            vs shim 0.5 mm (points)")
for name, sh in rows:
    v = stack(SLIDE20, sh)
    lo, hi = C.wilson(v, 20000)
    out["E"]["rows"].append({"name": name, "clean": v, "lo": lo, "hi": hi})
    print(f"{name:39s} | {v:.4f} [{lo:.4f}, {hi:.4f}]")
ref = out["E"]["rows"][0]["clean"]
for r in out["E"]["rows"]:
    r["delta"] = r["clean"] - ref
print("changes against the first row (points): " + ", ".join(f"{r['name']} {100 * r['delta']:+.2f}"
                                                            for r in out["E"]["rows"][1:]))
print()


def erow(name):
    return [r for r in out["E"]["rows"] if r["name"] == name][0]


# ------------------------------------------------------------------ F. hypotheses
print("## F. Hypotheses (registered in LOG.md before this run)")
s16 = erow("stack 1/16 in (horseshoe)")
h106 = (ref - s16["clean"]) <= 0.02
print(f"H106 (1/16 in stack within 2 points of shim 0.5 mm, slide {SLIDE20 / MM:.3f} mm): {s16['clean']:.4f} against "
      f"{ref:.4f} ({100 * (s16['clean'] - ref):+.2f} points) -> {'held' if h106 else 'refuted'}")
p107 = W.wedge_force(1, 0.4, 0.4, 0.4, rho=0.5)["P"]
g107 = robot_row("g1", 0.5)["push"]
h107 = g107 is not None and p107 < g107
print(f"H107 (G1 can drive the wedge at mu 0.4, rho 0.5, ledger at z 0.5 m): needs {p107:.1f} N, G1 gives {g107:.1f} N "
      f"-> {'held' if h107 else 'refuted'}")
r108 = dcell("g1", 0.8, 20 * MS)["rms"]
h108 = r108 < 0.1 * MM
print(f"H108 (wedge rms < 0.1 mm, G1 mass, 20 ms, ratio 0.8): {r108 / MM:.3f} mm -> {'held' if h108 else 'refuted'}")
out["F"] = {"H106": h106, "H106_clean": s16["clean"], "H106_ref": ref, "H107": h107, "H107_need": p107,
            "H107_g1": g107, "H108": h108, "H108_rms": r108}

json.dump(out, open(os.path.join(HERE, "results.json"), "w"), indent=1)
print(f"\n(run time {time.time() - T0:.0f} s; python {platform.python_version()}, numpy {np.__version__}, "
      f"mujoco {mujoco.__version__})")
