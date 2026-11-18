"""Milestone 35: the nailer's air hose as a force on the tool.

On milestone 32's leaned poses (G1 15, H1 20-21; robot balancing on 'hold-min', milestone 33's matched case),
with a 3/8 in x 50 ft hose (hybrid 0.152 kg/m, rubber 0.274 kg/m, listed weights) hanging from the grip as a
catenary to the floor and pulling horizontally with a tension H (0 to 20 N) in a direction phi (8 directions):
A. The hose's force per pose: the hanging weight (H = 0) and the drag the floor can hold (mu_f x L_drag).
B. Transmission windup from the hose at k_t (swept; free nose, before contact; invisible to the encoders).
C. The matched backlash compensator (milestone 33) with the hose unmodelled: residual after one calibration
   at milestone 30's pose (hose in the same state there) and mispredicted joints.
D. Stack (12 bits, 5 arcmin, matched compensation, k_t 1e4) with H uniform over [0, H_max]: the windup's
   spread as a scatter, the backlash residual and the windup's mean (both at H_max / 2) as a bias.
E. Servo droop under Unitree's PD gains (visible to the encoders), for reference.
F. Hypotheses H128-H131 (registered in LOG.md before this run).

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
from buildbot_sheathing import humanoid as Hm  # noqa: E402
from buildbot_sheathing import measured as M  # noqa: E402
from buildbot_sheathing import grf_qp as GQ  # noqa: E402
from buildbot_sheathing import pose_range as PR  # noqa: E402
from buildbot_sheathing import shim_mech as W  # noqa: E402
from buildbot_sheathing import straighten as St  # noqa: E402
from buildbot_sheathing import tool_lean as T  # noqa: E402
from buildbot_sheathing import compensate as C  # noqa: E402
from buildbot_sheathing import hose as Ho  # noqa: E402
from buildbot_sheathing import windup as WU  # noqa: E402
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
GAP = 5                            # arcmin, the registered case
TRIALS = 20000
KT = [3e3, 1e4, 3e4, 1e5]          # transmission stiffness (N m / rad), every joint; swept, not sourced
KREG = 1e4                         # the registered k_t
HS = [0.0, 2.0, 5.0, 10.0, 20.0]   # horizontal hose tension (N); swept, 0 to beyond the floor friction of ~10 m
PHIS = [math.radians(a) for a in range(0, 360, 45)]   # direction the hose pulls (0 = towards the wall, 90 = +y)
MU_F = [0.3, 0.5, 0.8]             # hose-on-floor friction, not sourced
L_DRAG = [2.0, 5.0, 10.0]          # hose length lying on the floor that the robot drags (m), not sourced
out = {"versions": {"python": platform.python_version(), "numpy": np.__version__}, "x": X, "ref": REF,
       "tool_kg": TOOL_KG, "L": L0, "press": [F_HI / 2, F_HI], "kt": KT, "hoses": Ho.HOSES, "H": HS,
       "phi_deg": [round(math.degrees(p)) for p in PHIS]}

print("# Milestone 35: the air hose as a force on the tool (hanging weight and floor drag)")

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





MU = 0.5
F_MID = 37.5
TT = (L0, 0, 0)
LIGHT = ("hip_roll", "hip_yaw", "ankle_roll")   # milestone 32's 'hold-min' set
TAUF = 0.2


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



GRIP = {}
for key in POSE:
    r = ROB[key[0]][0]
    d = mujoco.MjData(r.model)
    d.qpos[:] = POSE[key].qpos
    mujoco.mj_forward(r.model, d)
    bh, ph = r.hands["palm"][1]
    b = P._bid(r.model, bh)
    grip = d.xpos[b] + d.xmat[b].reshape(3, 3) @ np.asarray(ph, float)
    floor = min(p[2] for _, p in GQ.contact_points(r.model, d, r))
    GRIP[key] = float(grip[2] - floor)


def contact(r, qpos, F, kg, f_hose=None):
    h, d = GQ.generalised_load(r, qpos, kg, F, TT)
    if f_hose is not None:
        bh, ph = r.hands["palm"][1]
        jp, _ = P._jac(r.model, d, P._bid(r.model, bh), ph)
        h = h - Ho.generalised(jp, f_hose)
    pts = GQ.contact_points(r.model, d, r)
    return GQ.Contact(h, GQ.contact_jacobian(r.model, d, pts), MU)


def torques(n, key, signs, f_hose=None):
    """Actuated torques at the two press ends on 'hold-min', or None if the QP has no solution."""
    r, names, legs = ROB[n]
    q = POSE[key].qpos
    res = []
    for F in (F_HI / 2, F_HI):
        c = contact(r, q, F, TOOL_KG, f_hose)
        f, info = GQ.solve(c, "hold", legs, signs, TAUF, hold_idx=light(n))
        if f is None:
            return None
        res.append(c.tau(f))
    return res


def choose_signs(n):
    """Milestone 32's 'hold-min' sides (as milestones 33-34): the torque controller's at the reference pose
    where held, else the combination with the largest worst-case LP margin over the grid."""
    r, names, legs_all = ROB[n]
    legs = light(n)
    cref = [contact(r, POSE[(n,) + REF].qpos, F, TOOL_KG) for F in (F_HI / 2, F_HI)]
    tl = [c.tau(GQ.solve(c, "torque", legs_all, None, TAUF)[0]) for c in cref]
    tlo, thi = tl
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

GAPR = GAP * AM
TQ = {key: torques(key[0], key, SIGNS[key[0]]) for key in POSE}
KEYS = [k for k in POSE if TQ[k] is not None]
out["skipped"] = [list(k) for k in sorted(set(POSE) - set(KEYS))]
print(f"poses with a 'hold-min' solution: {len(KEYS)} (skipped: {out['skipped'] or 'none'})")
k0 = ("g1",) + REF
t0 = torques("g1", k0, SIGNS["g1"], np.zeros(3))
out["check_zero_force"] = float(max(np.max(np.abs(t0[j] - TQ[k0][j])) for j in (0, 1)))
print(f"check: a zero hose force reproduces the no-hose torques to {out['check_zero_force']:.1e} N m (expect 0)")
print(f"grip height above the floor over the poses: G1 {min(GRIP[k] for k in KEYS if k[0] == 'g1'):.3f}-"
      f"{max(GRIP[k] for k in KEYS if k[0] == 'g1'):.3f} m, H1 {min(GRIP[k] for k in KEYS if k[0] == 'h1'):.3f}-"
      f"{max(GRIP[k] for k in KEYS if k[0] == 'h1'):.3f} m")
print()

HT = {}          # (hose, H, phi index, key) -> torques with the hose


def tq_hose(hose, H, i, key):
    k = (hose, H, i if H > 0 else 0, key)
    if k not in HT:
        f = Ho.force(GRIP[key], H, Ho.HOSES[hose], PHIS[i] if H > 0 else 0.0)
        HT[k] = torques(key[0], key, SIGNS[key[0]], f)
    return HT[k]


def AB(key):
    jp, jr = POSE[key].rows[:2]
    return WU.nose_rows(jp, jr, L0)


def dtau(hose, H, i, key):
    """Mean torque change (over the press window) the hose adds."""
    t = tq_hose(hose, H, i, key)
    if t is None:
        return None
    return 0.5 * ((t[0] + t[1]) - (TQ[key][0] + TQ[key][1]))


def mm(o):
    return math.hypot(o["y"][0], o["z"][0]) / MM


# ------------------------------------------------------------------ A. the hose's force
print("## A. The hose's force at the grip. Hanging weight (H = 0) over the poses' grip heights, and the horizontal "
      "tension the floor holds (mu_f x L_drag), per hose")
out["A"] = {}
hs = [GRIP[k] for k in KEYS]
for hose, w in Ho.HOSES.items():
    v0 = [w * Ho.G * h for h in (min(hs), max(hs))]
    drag = {f"{mf} {L}": Ho.max_drag(w, mf, L) for mf in MU_F for L in L_DRAG}
    v20 = Ho.force(max(hs), 20.0, w, 0.0)[2]
    td = Ho.touchdown(1.0, 5.0, w)
    out["A"][hose] = {"w_kg_per_m": w, "hang_N": v0, "drag_N": drag, "vertical_at_20N_top": float(v20),
                      "touchdown_at_1m_5N": td}
    print(f"  {hose} ({w:.3f} kg/m): hanging {v0[0]:.2f}-{v0[1]:.2f} N ({v0[0] / Ho.G:.3f}-{v0[1] / Ho.G:.3f} kg); "
          f"vertical at H 20 N, highest grip {-v20:.2f} N; touchdown 1 m from a 1 m grip at 5 N {td:.2f} m")
    print("     floor holds (N), mu_f x L_drag: " + "  ".join(f"{k} m: {v:.1f}" for k, v in drag.items()))
print()

# ------------------------------------------------------------------ B. transmission windup
print("## B. Transmission windup at the free nose from the hose (mm, in the wall plane), worst pose and direction: "
      "robot | hose | H (N) | k_t 3e3 / 1e4 / 3e4 / 1e5 | at (z, dy, phi)")
out["B"] = []
infeasible = set()
for n in fetch.ROBOTS:
    ks = [k for k in KEYS if k[0] == n]
    for hose in Ho.HOSES:
        for H in HS:
            rec = {"robot": n, "hose": hose, "H": H, "worst": {}, "per_phi": {}}
            for kt in KT:
                best = (0.0, None)
                for i in (range(len(PHIS)) if H > 0 else [0]):
                    for key in ks:
                        dt = dtau(hose, H, i, key)
                        if dt is None:
                            infeasible.add((hose, H, i, key))
                            continue
                        v = mm(WU.offsets(*AB(key), WU.free_windup(dt, kt)))
                        if v > best[0]:
                            best = (v, (key[1], key[2], round(math.degrees(PHIS[i])) if H > 0 else None))
                rec["worst"][str(kt)] = [best[0], best[1]]
            # per direction at k_t 1e4: worst over poses
            for i in (range(len(PHIS)) if H > 0 else [0]):
                vals = [mm(WU.offsets(*AB(k), WU.free_windup(dtau(hose, H, i, k), KREG)))
                        for k in ks if dtau(hose, H, i, k) is not None]
                rec["per_phi"][str(round(math.degrees(PHIS[i])))] = max(vals) if vals else None
            out["B"].append(rec)
            w4 = rec["worst"]
            print(f"  {n} {hose:6s} {H:5.1f} | " + " / ".join(f"{w4[str(k)][0]:.3f}" for k in KT)
                  + f" | at {w4[str(KREG)][1]}")
print("  per direction at k_t 1e4 (worst pose), G1 rubber, H 5 N: " + "  ".join(
    f"{p}:{v:.3f}" for p, v in [x for x in out["B"] if x["robot"] == "g1" and x["hose"] == "rubber"
                                and x["H"] == 5.0][0]["per_phi"].items()))
out["infeasible"] = sorted([[h, H, round(math.degrees(PHIS[i])), k[0], k[1], k[2]] for h, H, i, k in infeasible])
print(f"hose cases with no 'hold-min' solution (skipped): {len(infeasible)}"
      + (f", e.g. {out['infeasible'][:4]}" if infeasible else ""))
print()

# ------------------------------------------------------------------ C. matched compensator, hose unmodelled
print("## C. Matched backlash compensator with the hose unmodelled (calibrated once at milestone 30's pose, hose in "
      "the same state there): worst |residual| along the wall y and vertically z (mm), worst direction | "
      "joints wrong / spurious / missed (summed over poses)")


def delta(t):
    return PR.held_bias(t[0], t[1], TAUF, GAPR)


DHAT = {key: delta(TQ[key]) for key in KEYS}


def comp_case(n, hose, H, i):
    ref = (n,) + REF
    tr = tq_hose(hose, H, i, ref)
    if tr is None:
        return None
    er = delta(tr) - DHAT[ref]
    res = []
    for key in [k for k in KEYS if k[0] == n]:
        t = tq_hose(hose, H, i, key)
        if t is None:
            continue
        dt = delta(t)
        mu = C.compensated(POSE[key].rows[:2], POSE[ref].rows[:2], dt - DHAT[key], er, L0)
        cl = C.classify(dt, DHAT[key], POSE[key].rows[2])
        res.append({"key": key, "mu": mu, "cl": cl})
    return res


out["C"] = []
for n in fetch.ROBOTS:
    for hose in Ho.HOSES:
        for H in HS:
            worst = None
            for i in (range(len(PHIS)) if H > 0 else [0]):
                rs = comp_case(n, hose, H, i)
                if not rs:
                    continue
                wy = max(rs, key=lambda x: abs(x["mu"]["y"][0]))
                wz = max(rs, key=lambda x: abs(x["mu"]["z"][0]))
                cl = [sum(x["cl"][j] for x in rs) for j in range(3)]
                cand = {"phi": round(math.degrees(PHIS[i])) if H > 0 else None, "y": wy["mu"]["y"][0], "at_y": list(wy["key"][1:]),
                        "z": wz["mu"]["z"][0], "at_z": list(wz["key"][1:]), "cl": cl, "poses": len(rs)}
                if worst is None or abs(cand["y"]) > abs(worst["y"]):
                    worst = cand
            rec = {"robot": n, "hose": hose, "H": H, **(worst or {})}
            out["C"].append(rec)
            if worst:
                print(f"  {n} {hose:6s} {H:5.1f} | y {worst['y'] / MM:+.3f} at {worst['at_y']} phi {worst['phi'] if H > 0 else '-'} | "
                      f"z {worst['z'] / MM:+.3f} at {worst['at_z']} | {worst['cl'][0]}/{worst['cl'][1]}/{worst['cl'][2]} "
                      f"over {worst['poses']} poses")
print()

# ------------------------------------------------------------------ D. stacks
print("## D. Stack loss (points) at k_t 1e4 with H uniform over [0, H_max] in the worst direction of C, against the "
      "matched stack with no hose; worst pose: robot | hose | H_max | loss | at")


def V(key, bias=None, span=None):
    t = TQ[key]
    loose = ~B.held(t[0], t[1], TAUF)
    err = B.from_rows(POSE[key].rows[0], POSE[key].rows[1], B.joint_sigmas(T.quant_sigma(12), GAPR, loose), L0)
    if bias is not None:
        err = PR.with_bias(err, bias)
    if span is not None:
        err = WU.with_scatter(err, span)
    return stack(err)


HMAX = [5.0, 10.0, 20.0]
V0 = {key: V(key) for key in KEYS}
out["D"] = []
for n in fetch.ROBOTS:
    ref = (n,) + REF
    ks = [k for k in KEYS if k[0] == n]
    hose = "rubber"
    for hm in HMAX:
        phi_deg = [x for x in out["C"] if x["robot"] == n and x["hose"] == hose and x["H"] == hm][0].get("phi")
        if phi_deg is None:
            continue
        i = [round(math.degrees(p)) for p in PHIS].index(phi_deg)
        hmid = hm / 2.0
        # mid-state torques for the backlash residual and the windup bias, computed directly
        def tq_at(H, key):
            return torques(key[0], key, SIGNS[key[0]], Ho.force(GRIP[key], H, Ho.HOSES[hose], PHIS[i]))
        tref = tq_at(hmid, ref)
        if tref is None:
            continue
        mean_ref = 0.5 * ((tref[0] + tref[1]) - (TQ[ref][0] + TQ[ref][1]))
        er = delta(tref) - DHAT[ref] + WU.free_windup(mean_ref, KREG)
        losses = {}
        for key in ks:
            tm, t0, t1 = tq_at(hmid, key), TQ[key], tq_hose(hose, hm, i, key)
            if tm is None or t1 is None:
                continue
            mean = 0.5 * ((tm[0] + tm[1]) - (t0[0] + t0[1]))
            ep = delta(tm) - DHAT[key] + WU.free_windup(mean, KREG)
            mu = C.compensated(POSE[key].rows[:2], POSE[ref].rows[:2], ep, er, L0)
            full = 0.5 * ((t1[0] + t1[1]) - (t0[0] + t0[1]))
            span = WU.offsets(*AB(key), WU.free_windup(full, KREG))
            losses[key] = (V0[key] - V(key, mu, span), mu)
        wk = max(losses, key=lambda k: losses[k][0])
        rec = {"robot": n, "hose": hose, "H_max": hm, "phi": phi_deg, "worst_loss": losses[wk][0],
               "at": list(wk[1:]), "per_pose": [{"z": k[1], "dy": k[2], "loss": v[0], "mu_y": v[1]["y"][0],
                                                 "mu_z": v[1]["z"][0]} for k, v in losses.items()]}
        out["D"].append(rec)
        print(f"  {n} {hose} {hm:5.1f} (phi {phi_deg}) | {100 * rec['worst_loss']:.2f} | at {rec['at']}")
print()

# ------------------------------------------------------------------ E. servo droop
print("## E. Servo droop from the hose under Unitree's PD gains, free nose (mm), worst pose and direction (visible to "
      "the encoders): robot | hose | H 0 / 5 / 20")
out["E"] = []
for n in fetch.ROBOTS:
    r = ROB[n][0]
    kp = Hm.gains(r)[6:]
    ks = [k for k in KEYS if k[0] == n]
    for hose in Ho.HOSES:
        row = {}
        for H in (0.0, 5.0, 20.0):
            vals = [mm(WU.offsets(*AB(k), WU.free_windup(dtau(hose, H, i, k), kp)))
                    for i in (range(len(PHIS)) if H > 0 else [0]) for k in ks if dtau(hose, H, i, k) is not None]
            row[str(H)] = max(vals) if vals else None
        out["E"].append({"robot": n, "hose": hose, "droop_mm": row})
        print(f"  {n} {hose:6s} | " + " / ".join(f"{v:.2f}" for v in row.values()))
print()

# ------------------------------------------------------------------ F. hypotheses
print("## F. Hypotheses (registered in LOG.md before this run)")
c0 = [x for x in out["C"] if x["robot"] == "g1" and x["hose"] == "rubber" and x["H"] == 0.0][0]
h128 = abs(c0["y"]) <= 0.1 * MM
print(f"H128 (hanging rubber hose, matched compensator: <= 0.1 mm along the wall): {c0['y'] / MM:+.3f} mm at "
      f"{c0['at_y']} -> {'held' if h128 else 'refuted'}")
c5 = [x for x in out["C"] if x["robot"] == "g1" and x["hose"] == "rubber" and x["H"] == 5.0][0]
c5h = [x for x in out["C"] if x["robot"] == "g1" and x["hose"] == "hybrid" and x["H"] == 5.0][0]
h129 = abs(c5["y"]) > 0.3 * MM
print(f"H129 (5 N drag, worst direction: > 0.3 mm along the wall): rubber {c5['y'] / MM:+.3f} mm at {c5['at_y']} "
      f"phi {c5['phi']} (hybrid {c5h['y'] / MM:+.3f}) -> {'held' if h129 else 'refuted'}")
b5 = [x for x in out["B"] if x["robot"] == "g1" and x["hose"] == "rubber" and x["H"] == 5.0][0]
h130 = b5["worst"][str(KREG)][0] > 0.5
print(f"H130 (5 N drag at k_t 1e4: free nose moves > 0.5 mm): {b5['worst'][str(KREG)][0]:.3f} mm at "
      f"{b5['worst'][str(KREG)][1]} -> {'held' if h130 else 'refuted'}")
pp = {int(k): v for k, v in b5["per_phi"].items() if v is not None}
along = max(pp.get(90, 0), pp.get(270, 0))
other = max(v for k, v in pp.items() if k not in (90, 270))
h131 = other <= 1.1 * along
print(f"H131 (along the wall is worst, within 10%): along {along:.3f} mm, best other {other:.3f} mm -> "
      f"{'held' if h131 else 'refuted'}")
out["F"] = {"H128": h128, "H129": h129, "H130": h130, "H131": h131}

json.dump(out, open(os.path.join(HERE, "results.json"), "w"), indent=1)
print(f"\n(run time {time.time() - T0:.0f} s; python {platform.python_version()}, numpy {np.__version__}, "
      f"mujoco {mujoco.__version__})")
