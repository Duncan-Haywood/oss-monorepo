"""Milestone 33: model-based compensation of the held joints' backlash, and the model error it survives.

On milestone 32's leaned poses (G1 15, H1 21; 12 bits, 5 arcmin, 25-50 N press, tau_f 0.2):
A. Nail mass: the magazine's 64 nails from steel density and nail size (the unmodelled load).
B. The robot runs a controller R ('hold-min' or 'torque') at the true tool mass; the compensator predicts
   every joint's side with its own model C ('none' = milestone 32's one calibration, 'free', 'force',
   'torque', 'hold-min') at the listed 3.4 kg. Mispredicted joints (wrong side / spurious / missed) and
   the residual along the wall after compensation and one calibration at milestone 30's pose.
C. Unmodelled mass: +0, +0.2, +0.4, +1.0 kg at the tool on the robot side.
D. Guard band tau_g (compensate only predicted |tau| >= tau_g): 0.2, 0.5, 1, 2 N m.
E. Stacks (single 2x, 20,000 trials) per pose for the no-extra-mass, no-guard cases, and at the worst
   residual pose for every other case.
F. Hypotheses H121-H123 (registered in LOG.md before this run).

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
from buildbot_sheathing import grf_qp as GQ  # noqa: E402
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

print("# Milestone 33: model-based backlash compensation and the model error it survives")

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




from buildbot_sheathing import compensate as C  # noqa: E402

MU = 0.5
F_MID = 37.5
TT = (L0, 0, 0)
LIGHT = ("hip_roll", "hip_yaw", "ankle_roll")   # milestone 32's 'hold-min' set
ROBOT_CTRL = ["hold-min", "torque"]
COMP = ["none", "free", "force", "torque", "hold-min"]
EXTRA = [0.0, 0.2, 0.4, 1.0]                     # kg at the tool the compensator does not know
GUARD = [0.2, 0.5, 1.0, 2.0]                     # tau_g (N m); 0.2 = tau_f, no band
TAUF = 0.2

# ------------------------------------------------------------------ A. what a magazine of nails weighs
STEEL = 7850.0                                   # kg/m^3, carbon steel
IN = 0.0254
NAILS = {"8d common 2-1/2 x 0.131 in": (2.5, 0.131, 0.281), "16d 3-1/2 x 0.131 in": (3.5, 0.131, 0.312)}
HEAD_T = 0.035                                   # in, head thickness (not sourced; small next to the shank)
print("## A. A full magazine (64 nails, Metabo HPT listing): nail | g per nail | kg per magazine")
out["A"] = {}
for k, (Lin, d, hd) in NAILS.items():
    g = STEEL * (np.pi * (d * IN / 2) ** 2 * Lin * IN + np.pi * (hd * IN / 2) ** 2 * HEAD_T * IN) * 1e3
    out["A"][k] = {"g": g, "kg_64": 64 * g / 1e3}
    print(f"  {k} | {g:.2f} | {64 * g / 1e3:.3f}")
print("(the plastic collation and the air hose's pull are not included; +1.0 kg is an allowance for them)")
print()

import mujoco  # noqa: E402
from buildbot_payload import fetch  # noqa: E402
from buildbot_payload import model as P  # noqa: E402

out["versions"]["mujoco"] = mujoco.__version__
out["menagerie_commit"] = fetch.COMMIT

ROB, POSE = {}, {}
for n in fetch.ROBOTS:
    r = P.load(n)
    d0 = P.standing(r)
    names = B.joint_names(r)
    legs = [i for i, nm in enumerate(names) if any(k in nm for k in ("hip", "knee", "ankle"))]
    ROB[n] = (r, names, legs)
    for z in GRID[n][0]:
        for dy in GRID[n][1]:
            p0 = P.pose(r, d0, (X, z), TOOL_KG, "palm", dy=dy)
            if not p0.ok:
                continue
            p, dx, cx = GQ.leaned_pose(r, d0, (X, z), TOOL_KG, F_MID, TT, dy=dy)
            w = GQ.press_window(r, p.qpos, TOOL_KG, TT, MU, F_MID) if p.ok else None
            if p.ok and w and w[0] <= F_HI / 2 and w[1] >= F_HI:
                POSE[(n, z, dy)] = p
print(f"leaned poses balancing 25-50 N (milestone 32's set): {len(POSE)}")


def rows_at(r, qpos):
    d = mujoco.MjData(r.model)
    d.qpos[:] = qpos
    mujoco.mj_forward(r.model, d)
    Jc = np.vstack([np.vstack(P._jac(r.model, d, P._bid(r.model, b), pt)) for b, pt in r.feet])
    bh, ph = r.hands["palm"][1]
    jp, jr = P._jac(r.model, d, P._bid(r.model, bh), ph)
    act = np.arange(6, r.model.nv)
    dbase = -np.linalg.pinv(Jc[:, :6]) @ Jc[:, act]
    return jp[:, act] + jp[:, :6] @ dbase, jr[:, act] + jr[:, :6] @ dbase


def light(n):
    names, legs = ROB[n][1], ROB[n][2]
    return [j for j in legs if any(k in names[j] for k in LIGHT)]


def contact(r, qpos, F, kg):
    h, d = GQ.generalised_load(r, qpos, kg, F, TT)
    pts = GQ.contact_points(r.model, d, r)
    return GQ.Contact(h, GQ.contact_jacobian(r.model, d, pts), MU)


def torques(n, key, model, kg, signs=None):
    r, names, legs = ROB[n]
    q = POSE[key].qpos
    if model == "free":
        return [B.static_torques(r, q, kg, F, TT) for F in (F_HI / 2, F_HI)]
    res = []
    for F in (F_HI / 2, F_HI):
        c = contact(r, q, F, kg)
        if model == "hold-min":
            f, info = GQ.solve(c, "hold", legs, signs, TAUF, hold_idx=light(n))
        else:
            f, info = GQ.solve(c, model, legs, signs, TAUF)
        if f is None:
            return None
        res.append(c.tau(f))
    return res


def choose_signs(n):
    """Milestone 32's 'hold-min' sides: the torque controller's at the reference pose where held, else the
    combination with the largest worst-case LP margin over the grid (at the listed mass)."""
    r, names, _ = ROB[n]
    legs = light(n)
    (tlo, thi) = torques(n, (n,) + REF, "torque", TOOL_KG)
    base = np.sign(thi[legs])
    amb = [k for k, j in enumerate(legs) if not B.held(tlo[j:j + 1], thi[j:j + 1], TAUF)[0]]
    cs = [contact(r, POSE[k].qpos, F, TOOL_KG) for k in POSE if k[0] == n for F in (F_HI / 2, F_HI)]
    best = None
    for combo in range(2 ** len(amb)):
        s = base.copy()
        for b, k in enumerate(amb):
            s[k] = 1.0 if (combo >> b) & 1 else -1.0
        worst = min(GQ.margin_lp(c, legs, s)[0] or -1e9 for c in cs)
        if best is None or worst > best[0]:
            best = (worst, s)
    return best[1]


SIGNS = {n: choose_signs(n) for n in fetch.ROBOTS}
for key in POSE:
    r = ROB[key[0]][0]
    jp, jr = rows_at(r, POSE[key].qpos)
    rows = B.tool_rows(jp, jr, TT)
    POSE[key].rows = (jp, jr, np.hypot(rows[1], rows[2]) > 1e-6)

# true torques (robot controller, true mass) and predicted ones (compensator model, listed mass)
TRUE, PRED = {}, {}
for key in POSE:
    n = key[0]
    for R in ROBOT_CTRL:
        for e in EXTRA:
            TRUE[(R, e, key)] = torques(n, key, R, TOOL_KG + e, SIGNS[n])
    for Cm in COMP[1:]:
        PRED[(Cm, key)] = torques(n, key, Cm, TOOL_KG, SIGNS[n])
infeas = sorted({(k[0], k[1]) + k[2] for k, v in TRUE.items() if v is None})
out["true_infeasible"] = [list(x) for x in infeas]
print(f"robot-side QPs infeasible (controller, extra kg, pose): {infeas or 'none'}")
pinf = sorted({(k[0],) + k[1] for k, v in PRED.items() if v is None})
out["pred_infeasible"] = [list(x) for x in pinf]
print(f"compensator-side QPs infeasible (model, pose; such poses are skipped): {pinf or 'none'}")
print()

GAPR = GAP * AM


def delta_true(R, e, key):
    t = TRUE[(R, e, key)]
    return None if t is None else PR.held_bias(t[0], t[1], TAUF, GAPR)


def delta_hat(Cm, key, tau_g):
    if Cm == "none":
        return np.zeros(len(ROB[key[0]][1]))
    t = PRED[(Cm, key)]
    if t is None:                    # the compensator's own QP has no solution at this pose
        return None
    return C.predicted_bias(t[0], t[1], TAUF, GAPR, tau_g)


def case(n, R, Cm, e, tau_g):
    """Per pose: residual dict and misprediction counts, for robot controller R, compensator Cm."""
    ref = (n,) + REF
    if delta_true(R, e, ref) is None or delta_hat(Cm, ref, tau_g) is None:
        return None
    if Cm == "none":                 # milestone 32's one calibration: nothing predicted, ref offset removed
        er = delta_true(R, e, ref)
    else:
        er = delta_true(R, e, ref) - delta_hat(Cm, ref, tau_g)
    rr = POSE[ref].rows[:2]
    res = []
    for key in [k for k in POSE if k[0] == n]:
        dt = delta_true(R, e, key)
        if dt is None:
            continue
        dh = delta_hat(Cm, key, tau_g)
        if dh is None:
            continue
        mu = C.compensated(POSE[key].rows[:2], rr, dt - dh, er, L0)
        cl = C.classify(dt, dh, POSE[key].rows[2]) if Cm != "none" else (0, 0, int((dt != 0).sum()))
        res.append({"z": key[1], "dy": key[2], "mu": mu, "wrong": cl[0], "spurious": cl[1], "missed": cl[2]})
    return res


V0 = {key: stack(B.from_rows(POSE[key].rows[0], POSE[key].rows[1], B.joint_sigmas(T.quant_sigma(12), 0,
                                                                                   np.zeros(1, bool)), L0))
      for key in POSE}


def stack_at(n, R, e, z, dy, mu):
    key = (n, z, dy)
    t = TRUE[(R, e, key)]
    loose = ~B.held(t[0], t[1], TAUF)
    err = B.from_rows(POSE[key].rows[0], POSE[key].rows[1], B.joint_sigmas(T.quant_sigma(12), GAPR, loose), L0)
    return stack(PR.with_bias(err, mu))


out["B"] = []
print("## B-D. Per robot, robot controller R, compensator model C, unmodelled kg, guard tau_g: worst |residual y| "
      "(mm) at pose | joints wrong side / spurious / missed (summed over poses) | stack loss at that pose (pts)")
for n in fetch.ROBOTS:
    for R in ROBOT_CTRL:
        for Cm in COMP:
            for e in EXTRA:
                for tg in (GUARD if Cm != "none" else [TAUF]):
                    rs = case(n, R, Cm, e, tg)
                    if rs is None:
                        continue
                    w = max(rs, key=lambda x: abs(x["mu"]["y"][0]))
                    full = e == 0.0 and tg == TAUF
                    if full:
                        losses = {(x["z"], x["dy"]): V0[(n, x["z"], x["dy"])] - stack_at(n, R, e, x["z"], x["dy"], x["mu"])
                                  for x in rs}
                        wl = max(losses.items(), key=lambda kv: kv[1])
                        lw = losses[(w["z"], w["dy"])]
                    else:
                        lw = V0[(n, w["z"], w["dy"])] - stack_at(n, R, e, w["z"], w["dy"], w["mu"])
                        wl = None
                    rec = {"robot": n, "R": R, "C": Cm, "extra": e, "tau_g": tg, "poses": len(rs),
                           "worst_mu_y": w["mu"]["y"][0], "at": [w["z"], w["dy"]],
                           "wrong": sum(x["wrong"] for x in rs), "spurious": sum(x["spurious"] for x in rs),
                           "missed": sum(x["missed"] for x in rs), "loss_at_worst": lw,
                           "worst_loss": None if wl is None else [wl[0][0], wl[0][1], wl[1]],
                           "per_pose": [{"z": x["z"], "dy": x["dy"], "mu_y": x["mu"]["y"][0], "wrong": x["wrong"],
                                         "spurious": x["spurious"], "missed": x["missed"]} for x in rs]}
                    out["B"].append(rec)
                    print(f"  {n} R={R:8s} C={Cm:8s} +{e:.1f} kg g={tg:.1f} | {w['mu']['y'][0] / MM:+.3f} at "
                          f"{w['z']:.1f} {w['dy']:+.2f} | {rec['wrong']}/{rec['spurious']}/{rec['missed']} | "
                          f"{100 * lw:.2f}" + (f" (worst pose {100 * wl[1]:.2f} at {wl[0][0]:.1f} {wl[0][1]:+.2f})"
                                               if wl else ""))
    print()


def get(n, R, Cm, e, tg):
    return [x for x in out["B"] if x["robot"] == n and x["R"] == R and x["C"] == Cm and x["extra"] == e
            and x["tau_g"] == tg][0]


# ------------------------------------------------------------------ checks
chk = get("g1", "hold-min", "hold-min", 0.0, TAUF)
base = get("g1", "hold-min", "none", 0.0, TAUF)
out["checks"] = {"matched_worst_mu_y": chk["worst_mu_y"], "none_worst_mu_y": base["worst_mu_y"]}
print(f"check: matched model leaves {chk['worst_mu_y'] / MM:+.2e} mm (expect 0); 'none' leaves "
      f"{base['worst_mu_y'] / MM:+.3f} mm (milestone 32: -1.401 at 1.2 -0.15)")
print()

# ------------------------------------------------------------------ F. hypotheses
print("## F. Hypotheses (registered in LOG.md before this run)")
h = get("g1", "hold-min", "free", 0.0, TAUF)
h121 = abs(h["worst_mu_y"]) > 1 * MM
print(f"H121 ('free' compensator, robot on 'hold-min'): worst {h['worst_mu_y'] / MM:+.3f} mm at {h['at']} "
      f"({h['wrong']} wrong / {h['spurious']} spurious / {h['missed']} missed) -> {'held' if h121 else 'refuted'}")
h = get("g1", "hold-min", "hold-min", 0.4, TAUF)
bad = h["wrong"] + h["spurious"] + h["missed"]
h122 = bad == 0 and abs(h["worst_mu_y"]) <= 0.3 * MM
print(f"H122 (matched controller, +0.4 kg unmodelled): {bad} mispredicted, worst {h['worst_mu_y'] / MM:+.3f} mm "
      f"-> {'held' if h122 else 'refuted'}")
h = get("g1", "hold-min", "free", 0.0, 1.0)
h123 = abs(h["worst_mu_y"]) <= 1 * MM
print(f"H123 ('free' compensator, guard 1 N m): worst {h['worst_mu_y'] / MM:+.3f} mm "
      f"({h['wrong']}/{h['spurious']}/{h['missed']}) -> {'held' if h123 else 'refuted'}")
out["F"] = {"H121": h121, "H122": h122, "H123": h123}

json.dump(out, open(os.path.join(HERE, "results.json"), "w"), indent=1)
print(f"\n(run time {time.time() - T0:.0f} s; python {platform.python_version()}, numpy {np.__version__}, "
      f"mujoco {mujoco.__version__})")
