"""Milestone 31: gear backlash across the poses along a wall (held sets, sign flips, one calibration).

A. The grid: hand reach 0.4 m, heights and along-wall shifts the IK reaches (G1 and H1, MuJoCo Menagerie).
B. Per pose: static torques at a 25-50 N press (milestone 30's model), the held set, which joints are
   loose; held joints whose torque changes sign across the grid.
C. Per pose, per-pose calibration: the best single-2x stack at 12 bits, 0 and 5 arcmin, preloaded.
D. One tool-frame calibration at milestone 30's pose (0.4, 1.0): the residual bias at each pose, split into
   its Jacobian and sign-flip parts, and the stack with that bias.
E. The largest backlash one calibration tolerates (2 points at the worst pose) against per-pose calibration.
F. Hypotheses H115-H117 (registered in LOG.md before this run).

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
from buildbot_sheathing import measured as M  # noqa: E402
from buildbot_sheathing import pose_range as PR  # noqa: E402
from buildbot_sheathing import shim_mech as W  # noqa: E402
from buildbot_sheathing import straighten as St  # noqa: E402
from buildbot_sheathing import tool_lean as T  # noqa: E402
from buildbot_sheathing.asbuilt import STUD_LEN, U_JOINT  # noqa: E402

T0 = time.time()
MM = 1e-3
MS = 1e-3
AM = B.ARCMIN
TOOL_KG = 3.4                      # buildbot-fasten: Metabo HPT NR90AES1, 7.5 lb
X = 0.4                            # hand reach (m), milestones 29-30
REF = (1.0, 0.0)                   # milestone 30's pose (height z, along-wall shift dy)
L0 = 0.30                          # nose behind the grip; sourced bracket 0.29-0.32 m (milestone 30)
GRID = {"g1": ([0.4, 0.6, 0.8, 1.0, 1.2], [-0.15, 0.0, 0.15]),
        "h1": ([0.4, 0.6, 0.8, 1.0, 1.2, 1.4, 1.6], [-0.15, 0.0, 0.15])}
F_HI = 50                          # press range [25, 50] N at firing (milestone 30)
TAU_F = [0.05, 0.2, 0.5]           # holding threshold (N m), not sourced; 0.2 is the main case
GAP = 5                            # arcmin, the registered case
TRIALS = 20000
out = {"versions": {"python": platform.python_version(), "numpy": np.__version__}, "x": X, "ref": REF,
       "tool_kg": TOOL_KG, "L": L0, "press": [F_HI / 2, F_HI]}

print("# Milestone 31: backlash across the poses along a wall")

import mujoco  # noqa: E402
from buildbot_payload import fetch  # noqa: E402
from buildbot_payload import model as P  # noqa: E402

out["versions"]["mujoco"] = mujoco.__version__
out["menagerie_commit"] = fetch.COMMIT

D = json.load(open(os.path.join(HERE, "..", "m11_measured", "profiles.json")))
MID = St.Straightener("mid", U_JOINT, "pinned", 0.5e-3)
PROF = M.model_profiles(D["members"], "smooth", STUD_LEN)
m6b = json.load(open(os.path.join(HERE, "..", "m6b_bowed_edge", "results.json")))
ROCK = np.radians(np.array(m6b["F_draws"]["drake_deg"]))
m27 = json.load(open(os.path.join(HERE, "..", "m27_slide_mech", "results.json")))
SLIDE20 = [c for c in m27["D"] if c["mu_s"] == 0.4 and c["ratio"] == 0.8 and c["tau"] == 20 * MS
           and c["cv"] == 0.1][0]["rms"]
SHIM16 = lambda h: W.stack_residual(h, W.STEP_STACK)  # noqa: E731


def stack(tool):
    return Q.clean(framing="2x", policy="local", rock_draw=ROCK, straighten=MID, profiles=PROF,
                   warp="straight", trials=TRIALS, seed=7, slide=SLIDE20, shim=SHIM16, tool=tool)["clean"]


# ------------------------------------------------------------------ A, B. grid, torques, held sets
S = {}                              # (robot, z, dy) -> state
print("## A-B. Grid and held sets (press 25-50 N at a 0.3 m nose, tau_f 0.2 N m)")
print("robot z (m) dy (m) | moving | held | loose (of the joints that move the nose)")
out["poses"] = []
for n in fetch.ROBOTS:
    r = P.load(n)
    d0 = P.standing(r)
    names = B.joint_names(r)
    for z in GRID[n][0]:
        for dy in GRID[n][1]:
            p = P.pose(r, d0, (X, z), TOOL_KG, "palm", dy=dy)
            if not p.ok:
                print(f"  {n} {z:.1f} {dy:+.2f} | IK misses by {p.residual * 100:.1f} cm: out of reach")
                out["poses"].append({"robot": n, "z": z, "dy": dy, "ok": False, "residual": p.residual})
                continue
            d = mujoco.MjData(r.model)
            d.qpos[:] = p.qpos
            mujoco.mj_forward(r.model, d)
            Jc = np.vstack([np.vstack(P._jac(r.model, d, P._bid(r.model, b), pt)) for b, pt in r.feet])
            bh, ph = r.hands["palm"][1]
            jp, jr = P._jac(r.model, d, P._bid(r.model, bh), ph)
            act = np.arange(6, r.model.nv)
            dbase = -np.linalg.pinv(Jc[:, :6]) @ Jc[:, act]
            jp, jr = jp[:, act] + jp[:, :6] @ dbase, jr[:, act] + jr[:, :6] @ dbase
            tlo = B.static_torques(r, p.qpos, TOOL_KG, F_HI / 2, (L0, 0, 0))
            thi = B.static_torques(r, p.qpos, TOOL_KG, F_HI, (L0, 0, 0))
            rows = B.tool_rows(jp, jr, (L0, 0, 0))
            moving = np.hypot(rows[1], rows[2]) > 1e-6
            st = {"jp": jp, "jr": jr, "tlo": tlo, "thi": thi, "moving": moving, "names": names}
            S[(n, z, dy)] = st
            rec = {"robot": n, "z": z, "dy": dy, "ok": True, "residual": p.residual, "held": {}}
            for tf in TAU_F:
                h = B.held(tlo, thi, tf)
                loose = [names[k].replace("_joint", "") for k in np.flatnonzero(~h & moving)]
                rec["held"][str(tf)] = {"held": int((h & moving).sum()), "moving": int(moving.sum()), "loose": loose}
            rec["tau_hi"] = thi.tolist()
            out["poses"].append(rec)
            h2 = rec["held"]["0.2"]
            print(f"  {n} {z:.1f} {dy:+.2f} | {h2['moving']:2d} | {h2['held']:2d} | {', '.join(h2['loose'])}")
print()

print("## B2. Held joints whose torque changes sign across the grid (held at every pose, tau_f 0.2)")
out["flips"] = {}
for n in fetch.ROBOTS:
    keys = [k for k in S if k[0] == n]
    taus = [S[k]["thi"] for k in keys]
    hm = [B.held(S[k]["tlo"], S[k]["thi"], 0.2) for k in keys]
    mv = np.all([S[k]["moving"] for k in keys], axis=0)
    idx = PR.sign_flips(taus, hm, mv)
    names = S[keys[0]]["names"]
    always = int((np.all(hm, axis=0) & mv).sum())
    out["flips"][n] = {"always_held": always, "flips": [names[k] for k in idx],
                       "range": {names[k]: [float(min(t[k] for t in taus)), float(max(t[k] for t in taus))]
                                 for k in idx}}
    print(f"  {n}: {always} joints held at every pose; flipping: "
          + (", ".join(f"{names[k].replace('_joint', '')} ({min(t[k] for t in taus):+.2f} to "
                       f"{max(t[k] for t in taus):+.2f} N m)" for k in idx) or "none"))
print()


# ------------------------------------------------------------------ C, D. stacks per pose
def err_at(st, bits, gap_am, tau_f=0.2):
    loose = ~B.held(st["tlo"], st["thi"], tau_f)
    sig = B.joint_sigmas(T.quant_sigma(bits), gap_am * AM, loose)
    return B.from_rows(st["jp"], st["jr"], sig, L0)


def bias_at(st, gap_am, tau_f=0.2):
    delta = PR.held_bias(st["tlo"], st["thi"], tau_f, gap_am * AM)
    return delta, PR.nose_bias(st["jp"], st["jr"], delta, L0)


def one_cal(n, key, gap_am, tau_f=0.2):
    """Residual bias at pose ``key`` after one tool-frame calibration at REF, and its two parts."""
    ref = S[(n,) + REF]
    st = S[key]
    dref, bref = bias_at(ref, gap_am, tau_f)
    dp, bp = bias_at(st, gap_am, tau_f)
    mu = PR.residual(bp, bref)
    jac = PR.residual(PR.nose_bias(st["jp"], st["jr"], dref, L0), bref)
    flip = PR.nose_bias(st["jp"], st["jr"], dp - dref, L0)
    return mu, jac, flip


print(f"## C-D. Single-2x stack per pose, 12 bits (preloaded, tau_f 0.2): no backlash | {GAP} arcmin per-pose "
      f"calibration | {GAP} arcmin one calibration at z {REF[0]}, dy {REF[1]}")
print("robot z dy | 0 | per-pose (pts) | one cal (pts) | residual y surf, y depth, z surf (mm) | y: Jacobian part, flip part (mm)")
out["CD"] = []
for key in S:
    n, z, dy = key
    st = S[key]
    v0 = stack(err_at(st, 12, 0))
    e5 = err_at(st, 12, GAP)
    vp = stack(e5)
    mu, jac, flip = one_cal(n, key, GAP)
    vc = stack(PR.with_bias(e5, mu))
    rec = {"robot": n, "z": z, "dy": dy, "v0": v0, "per_pose": vp, "one_cal": vc, "mu": mu, "jac": jac,
           "flip": flip, "s_y": e5.y.s_surf}
    out["CD"].append(rec)
    print(f"  {n} {z:.1f} {dy:+.2f} | {v0:.4f} | {vp:.4f} ({100 * (vp - v0):+.2f}) | {vc:.4f} ({100 * (vc - v0):+.2f}) | "
          f"{mu['y'][0] / MM:+.3f}, {mu['y'][1] / MM:+.3f}, {mu['z'][0] / MM:+.3f} | {jac['y'][0] / MM:+.3f}, "
          f"{flip['y'][0] / MM:+.3f}")
print()

print("## D2. tau_f sweep, G1: worst per-pose loss and worst |residual y surface| under one calibration")
out["D2"] = []
for tf in TAU_F:
    worst_pp, worst_mu = 0.0, 0.0
    for key in [k for k in S if k[0] == "g1"]:
        st = S[key]
        v0 = [x for x in out["CD"] if (x["robot"], x["z"], x["dy"]) == key][0]["v0"]
        worst_pp = max(worst_pp, v0 - stack(err_at(st, 12, GAP, tf)))
        mu, _, _ = one_cal("g1", key, GAP, tf)
        worst_mu = max(worst_mu, abs(mu["y"][0]))
    out["D2"].append({"tau_f": tf, "worst_pp": worst_pp, "worst_mu_y": worst_mu})
    print(f"  tau_f {tf:.2f}: worst per-pose loss {100 * worst_pp:.2f} pts; worst |mu_y| {worst_mu / MM:.3f} mm")
print()

# ------------------------------------------------------------------ E. the spec under one calibration
print("## E. Largest backlash (arcmin) for at most 2 points below the pose's no-backlash stack, G1, at the worst pose")
out["E"] = []
for bits in (12, 13):
    g1 = [k for k in S if k[0] == "g1"]
    base = {k: stack(err_at(S[k], bits, 0)) for k in g1}

    def loss(k, g, cal):
        e = err_at(S[k], bits, g)
        if cal == "one":
            e = PR.with_bias(e, one_cal("g1", k, g)[0])
        return base[k] - stack(e)

    for cal in ("per-pose", "one"):
        wk = max(g1, key=lambda k: loss(k, GAP, cal))
        lo, hi = 0.0, 30.0
        if loss(wk, hi, cal) <= 0.02:
            gmax = float("inf")
        else:
            for _ in range(9):
                mid = (lo + hi) / 2
                lo, hi = (mid, hi) if loss(wk, mid, cal) <= 0.02 else (lo, mid)
            gmax = (lo + hi) / 2
        # the worst pose at 5 arcmin need not stay worst at the bisected gap: check every pose there
        if gmax != float("inf"):
            wk2 = max(g1, key=lambda k: loss(k, gmax, cal))
            if loss(wk2, gmax, cal) > 0.021:
                lo, hi = 0.0, gmax
                for _ in range(9):
                    mid = (lo + hi) / 2
                    lo, hi = (mid, hi) if loss(wk2, mid, cal) <= 0.02 else (lo, mid)
                gmax, wk = (lo + hi) / 2, wk2
        out["E"].append({"bits": bits, "cal": cal, "gap": None if gmax == float("inf") else gmax,
                         "worst": list(wk[1:])})
        print(f"  {bits} bits, {cal:8s} calibration: {('> 30' if gmax == float('inf') else f'{gmax:.2f}')} arcmin "
              f"(worst pose z {wk[1]:.1f}, dy {wk[2]:+.2f})")
print()

# ------------------------------------------------------------------ F. hypotheses
print("## F. Hypotheses (registered in LOG.md before this run)")
g1cd = [x for x in out["CD"] if x["robot"] == "g1"]
w115 = max(g1cd, key=lambda x: x["v0"] - x["per_pose"])
h115 = (w115["v0"] - w115["per_pose"]) <= 0.03
print(f"H115 (every G1 pose within 3 points, per-pose calibration): worst z {w115['z']:.1f} dy {w115['dy']:+.2f} "
      f"{100 * (w115['per_pose'] - w115['v0']):+.2f} -> {'held' if h115 else 'refuted'}")
h116 = len(out["flips"]["g1"]["flips"]) >= 1
print(f"H116 (some G1 joint held at every pose flips sign): {out['flips']['g1']['flips'] or 'none'} -> "
      f"{'held' if h116 else 'refuted'}")
w117 = max(g1cd, key=lambda x: abs(x["mu"]["y"][0]))
h117 = abs(w117["mu"]["y"][0]) > 0.3 * MM
print(f"H117 (one calibration leaves > 0.3 mm along the wall at the worst G1 pose): z {w117['z']:.1f} "
      f"dy {w117['dy']:+.2f} {w117['mu']['y'][0] / MM:+.3f} mm -> {'held' if h117 else 'refuted'}")
out["F"] = {"H115": h115, "H115_worst": [w115["z"], w115["dy"], w115["v0"] - w115["per_pose"]],
            "H116": h116, "H117": h117, "H117_worst": [w117["z"], w117["dy"], w117["mu"]["y"][0]]}

json.dump(out, open(os.path.join(HERE, "results.json"), "w"), indent=1)
print(f"\n(run time {time.time() - T0:.0f} s; python {platform.python_version()}, numpy {np.__version__}, "
      f"mujoco {mujoco.__version__})")
