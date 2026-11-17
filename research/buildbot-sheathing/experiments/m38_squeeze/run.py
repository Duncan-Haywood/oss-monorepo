"""Milestone 38: a two-hand squeeze as the arm-joint preload (milestone 37 left the arms and waist).

Milestone 37's setup and settle model (leaned poses on 'hold-min', rubber hose as a catenary from the grip,
horizontal tension H in direction phi, k_t 1e4 on every joint, one calibration at milestone 30's pose in the
same hose state and sensor error), with its leg preload at m = 0.1 N m. New here: a squeeze s along the line
between the grip points (``squeeze``), chosen by the controller from its plan over [-S, S] to keep the moving
arm joints as far from tau_f as it can at both press ends, inside the MJCF's torque limits; the same s acts
when the robot settles under the true force.

A. Flip census (hold set, other leg, waist, arm) per S. B. Worst residual per S, |e| 0.2 and 2.4 N, H 0, 5,
20 N. B2. The squeeze used and the arm margin reached (H 0, exact sensor). D. Stacks over 0-H_max with the
FT 300's noise. E. Hypotheses H141-H145 (registered in LOG.md before this run).

Reads ../m11_measured/profiles.json, ../m6b_bowed_edge/results.json, ../m27_slide_mech/results.json,
../m35_hose/results.json and ../m37_preload/results.json. Sections run in a process pool (fork; set
M38_PROCS, default 4).
"""
import os as _os
for _v in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"):
    _os.environ.setdefault(_v, "1")       # one BLAS thread per pool process (oversubscription made it 20x slower)
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
from buildbot_sheathing import wrist_ft as FT  # noqa: E402
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
TRIALS = 2000 if os.environ.get("M38_SMOKE") else 20000
KT = [3e3, 1e4, 3e4, 1e5]          # transmission stiffness (N m / rad), every joint; swept, not sourced
KREG = 1e4                         # the registered k_t
HS = [0.0, 5.0, 10.0, 20.0]        # horizontal hose tension (N); milestone 35 swept 0-20
PHIS = [math.radians(a) for a in range(0, 360, 45)]   # direction the hose pulls (0 = towards the wall, 90 = +y)
MU_F = [0.3, 0.5, 0.8]             # hose-on-floor friction, not sourced
L_DRAG = [2.0, 5.0, 10.0]          # hose length lying on the floor that the robot drags (m), not sourced
out = {"versions": {"python": platform.python_version(), "numpy": np.__version__}, "x": X, "ref": REF,
       "tool_kg": TOOL_KG, "L": L0, "press": [F_HI / 2, F_HI], "kt": KT, "hoses": Ho.HOSES, "H": HS,
       "phi_deg": [round(math.degrees(p)) for p in PHIS]}

print("# Milestone 38: a two-hand squeeze as the arm-joint preload")

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



from buildbot_sheathing import preload as PL  # noqa: E402
from buildbot_sheathing import squeeze as SQZ  # noqa: E402
import multiprocessing as mp  # noqa: E402

HOSE = "rubber"
W_HOSE = Ho.HOSES[HOSE]
M_LEG = 0.1                                      # milestone 37's leg preload pick (N m)
SQ = [0.0, 10.0, 20.0, 40.0]                     # squeeze bound S (N); no hand grip force is published: swept
BS = [0.2, 2.4]                                  # |e| (N): 2 x FT 300 0.1 N, 2 x pre-2017 FT 300 1.2 N
HB = [0.0, 5.0, 20.0]
if os.environ.get("M38_SMOKE"):                  # a fast code check of every section; its numbers are not results
    HB, PHIS[:], SQ = [0.0, 5.0], PHIS[:2], [0.0, 20.0]
    KEYS[:] = [k for k in KEYS if k[2] == 0.0 or k[1:] == (1.0, 0.0)]
AXES = FT.AXES
NOISE = {k: np.array(v) for k, v in FT.SENSORS.items()}
out.update({"hose": HOSE, "m_leg": M_LEG, "S": SQ, "b": BS, "H": HB, "model": "settle"})
m35 = json.load(open(os.path.join(HERE, "..", "m35_hose", "results.json")))
m37 = json.load(open(os.path.join(HERE, "..", "m37_preload", "results.json")))


def kind(n, j):
    """'hold' (milestone 32's set), 'leg', 'waist' or 'arm' for joint index j."""
    names, legs = ROB[n][1], ROB[n][2]
    if j in light(n):
        return "hold"
    if j in legs:
        return "leg"
    return "waist" if any(k in names[j] for k in ("waist", "torso")) else "arm"


LIM = {n: SQZ.torque_limits(ROB[n][0], ROB[n][1]) for n in ROB}
SQA, SQB, ARMS = {}, {}, {}
for key in KEYS:
    n = key[0]
    r = ROB[n][0]
    d = mujoco.MjData(r.model)
    d.qpos[:] = POSE[key].qpos
    mujoco.mj_forward(r.model, d)
    (bl, pl), (br, pr) = r.hands["palm"]
    jl, _ = P._jac(r.model, d, P._bid(r.model, bl), pl)
    jr_, _ = P._jac(r.model, d, P._bid(r.model, br), pr)
    gl = d.xpos[P._bid(r.model, bl)] + d.xmat[P._bid(r.model, bl)].reshape(3, 3) @ np.asarray(pl, float)
    gr = d.xpos[P._bid(r.model, br)] + d.xmat[P._bid(r.model, br)].reshape(3, 3) @ np.asarray(pr, float)
    gen = SQZ.generalised(jl, jr_, SQZ.direction(gl, gr))
    SQB[key] = gen                               # per newton; h loses it, so tau changes by -gen[6:]
    SQA[key] = -gen[6:]
    ARMS[key] = [j for j in range(len(ROB[n][1])) if kind(n, j) == "arm" and POSE[key].rows[2][j]]

PLANS = {}


def plan(key, f, e, S):
    """(t_act, t_plan, s, margin): the robot's torques after settling under the true force f and the plan
    from the measured force f + e, leg preload M_LEG, squeeze chosen over [-S, S]; None without a plan."""
    k = (key, tuple(np.round(f, 9)), tuple(np.round(e, 9)), S)
    if k in PLANS:
        return PLANS[k]
    n = key[0]
    r, names, legs = ROB[n]
    q = POSE[key].qpos
    ta, tp = [], []
    res = None
    for F in (F_HI / 2, F_HI):
        cm = contact(r, q, F, TOOL_KG, np.asarray(f, float) + np.asarray(e, float))
        fn, _ = GQ.solve(cm, "hold", legs, SIGNS[n], TAUF, hold_idx=light(n))
        if fn is None:
            break
        rows, kap, d = PL.margin_rows(cm.tau(fn), legs, TAUF)
        fn = PL.solve_margin(cm, legs, rows, kap, d, M_LEG)
        if fn is None:
            break
        ct = contact(r, q, F, TOOL_KG, np.asarray(f, float))
        tp.append(cm.tau(fn))
        ta.append(ct.tau(PL.settle(ct, fn)))
    else:
        # a joint the plan already holds over its MJCF limit may not be pushed further over it (post hoc: the
        # smoke run found G1 wrist joints over their 5 N m with no squeeze, so the registered limit had no solution)
        lim = np.maximum(LIM[n], np.maximum(np.abs(tp[0]), np.abs(tp[1])))
        s, mg = SQZ.best_squeeze(tp[0], tp[1], SQA[key], ARMS[key], TAUF, S, lim)
        a = SQA[key]
        res = ([t + a * s for t in ta], [t + a * s for t in tp], s, mg)
    PLANS[k] = res
    return res


def joint_err(key, f, e, S):
    p = plan(key, f, e, S)
    if p is None:
        return None
    ta, tp = p[0], p[1]
    return FT.joint_error(ta, tp, TQ[key], TAUF, GAPR, KREG, 0.0)


def hose_f(key, H, phi):
    return Ho.force(GRIP[key], H, W_HOSE, phi)


def residuals(n, H, phi, e, S):
    """{pose: residual dict} after one calibration at milestone 30's pose."""
    ref = (n,) + REF
    er = joint_err(ref, hose_f(ref, H, phi), e, S)
    if er is None:
        return {}
    res = {}
    for key in [k for k in KEYS if k[0] == n]:
        ep = joint_err(key, hose_f(key, H, phi), e, S)
        if ep is not None:
            res[key] = C.compensated(POSE[key].rows[:2], POSE[ref].rows[:2], ep, er, L0)
    return res


def phis_for(H):
    return list(range(len(PHIS))) if H > 0 else [0]


def task_B(args):
    """Worst |y|, |z| per (H, |e|) for robot n at squeeze bound S, the flip census (|e| 0.2) and B2."""
    n, S = args
    t1 = time.time()
    rows, census = [], []
    for H in HB:
        for b in BS:
            best, per_pose, solved = None, {}, set()
            for i in phis_for(H):
                phi = PHIS[i] if H > 0 else 0.0
                for a in AXES:
                    e = b * a
                    rg = residuals(n, H, phi, e, S)
                    for key, mu in rg.items():
                        solved.add(key)
                        if best is None or abs(mu["y"][0]) > abs(best["y"]):
                            best = {"y": mu["y"][0], "at": list(key[1:]), "phi": round(math.degrees(phi)),
                                    "e": [float(x) for x in e]}
                        if key not in per_pose or abs(mu["y"][0]) > per_pose[key][0]:
                            per_pose[key] = (abs(mu["y"][0]), phi, e)
                    zs = [abs(mu["z"][0]) for mu in rg.values()]
                    if zs and best is not None:
                        best["z"] = max(best.get("z", 0.0), max(zs))
            rows.append({"robot": n, "S": S, "H": H, "b": b, "poses": len(solved), "worst": best})
            if b == 0.2:
                cnt = {"hold": 0, "leg": 0, "waist": 0, "arm": 0}
                for key, (_, phi, e) in per_pose.items():
                    ta, tp = plan(key, hose_f(key, H, phi), e, S)[:2]
                    for j in np.flatnonzero(PL.flips(ta, tp, TAUF) & POSE[key].rows[2]):
                        cnt[kind(n, j)] += 1
                census.append({"robot": n, "S": S, "H": H, "count": cnt})
    b2 = {}
    for key in [k for k in KEYS if k[0] == n]:
        p = plan(key, np.zeros(3), np.zeros(3), S)
        if p is None:
            b2[str(list(key[1:]))] = None
            continue
        arms = ARMS[key]
        b2[str(list(key[1:]))] = {"s": p[2], "margin": p[3], "arms": len(arms),
                                  "max_arm_tau": float(max(np.max(np.abs(t[arms])) for t in p[1])) if arms else 0.0,
                                  "max_arm_use": float(max(np.max(np.abs(t[arms]) / LIM[n][arms]) for t in p[1]))
                                  if arms else 0.0,
                                  "over_limit": [ROB[n][1][j] for j in arms
                                                 if max(abs(p[1][0][j] - SQA[key][j] * p[2]),
                                                        abs(p[1][1][j] - SQA[key][j] * p[2])) > LIM[n][j]]}
    return {"n": n, "S": S, "rows": rows, "census": census, "b2": b2, "s": time.time() - t1}


def noise_span(key, f, sig, S):
    parts = []
    for a, s in zip(AXES[0::2], sig):
        dq = joint_err(key, f, s * a, S)
        if dq is None:
            return None
        parts.append(FT.uniform_equivalent(WU.offsets(*WU.nose_rows(*POSE[key].rows[:2], L0), dq)))
    return FT.combine_spans(*parts)


def V(key, bias=None, span=None):
    t = TQ[key]
    loose = ~B.held(t[0], t[1], TAUF)
    err = B.from_rows(POSE[key].rows[0], POSE[key].rows[1], B.joint_sigmas(T.quant_sigma(12), GAPR, loose), L0)
    if bias is not None:
        err = PR.with_bias(err, bias)
    if span is not None:
        err = WU.with_scatter(err, span)
    return stack(err)


def task_D(args):
    """Worst stack loss over the poses for robot n, H_max, squeeze bound S, FT 300 noise, |e| 0.2 bias."""
    n, hm, phi_deg, S = args
    phi = math.radians(phi_deg)
    rrs = [residuals(n, hm / 2, phi, 0.2 * a, S) for a in AXES]
    losses = {}
    for key in [k for k in KEYS if k[0] == n]:
        cand = [rr[key] for rr in rrs if key in rr]
        if not cand:
            continue
        best = max(cand, key=lambda x: abs(x["y"][0]))
        sp = noise_span(key, hose_f(key, hm / 2, phi), NOISE["ft300"], S)
        if sp is None:
            continue
        losses[key] = V(key) - V(key, best, sp)
    wk = max(losses, key=losses.get)
    return {"robot": n, "H_max": hm, "phi": phi_deg, "S": S, "worst_loss": losses[wk], "at": list(wk[1:]),
            "poses": len(losses)}


if __name__ == "__main__":
    base = max(float(np.max(np.abs(SQB[k][:6]))) for k in KEYS)
    nonarm = max(float(np.max(np.abs(SQA[k][[j for j in range(len(ROB[k[0]][1])) if kind(k[0], j) != "arm"]])))
                 for k in KEYS)
    armmax = max(float(np.max(np.abs(SQA[k][[j for j in range(len(ROB[k[0]][1])) if kind(k[0], j) == "arm"]])))
                 for k in KEYS)
    out["check_squeeze"] = {"base": base, "legs_waist": nonarm, "arms": armmax}
    print(f"check (H141): per newton of squeeze, largest base generalised force {base:.1e}, largest leg or waist "
          f"torque {nonarm:.1e} N m, largest arm torque {armmax:.3f} N m")
    k0 = ("g1",) + REF
    p0 = plan(k0, hose_f(k0, 5.0, 0.0), np.zeros(3), 0.0)
    print(f"check: S = 0 picks s = {p0[2]:g} (expect 0)")
    print("limits (N m) on the moving arm joints: " + "; ".join(
        f"{n} " + ", ".join(sorted({f'{LIM[n][j]:g}' for k in KEYS if k[0] == n for j in ARMS[k]})) for n in ROB))
    print(f"moving arm joints per pose: " + ", ".join(
        f"{n} {min(len(ARMS[k]) for k in KEYS if k[0] == n)}-{max(len(ARMS[k]) for k in KEYS if k[0] == n)}" for n in ROB))
    print()

    procs = int(os.environ.get("M38_PROCS", "4"))
    ctx = mp.get_context("fork")
    with ctx.Pool(procs) as pool:
        resB = pool.map(task_B, [(n, S) for S in SQ for n in ("h1", "g1")], chunksize=1)
    out["B"] = [r for x in resB for r in x["rows"]]
    out["census"] = [c for x in resB for c in x["census"]]
    out["B2"] = [{"robot": x["n"], "S": x["S"], "poses": x["b2"]} for x in resB]
    print("(section B tasks: " + ", ".join(f"{x['n']} S {x['S']:g} {x['s']:.0f} s" for x in resB) + ")")
    print()

    print("## A. Which joints flip under the settle model, m 0.1 N m, |e| 0.2 N (per pose its worst direction and "
          "signed axis; moving joints): robot | H | S | hold set / other leg / waist / arm")
    tot = {}
    for S in SQ:
        tot[S] = {"hold": 0, "leg": 0, "waist": 0, "arm": 0}
        for c in [c for c in out["census"] if c["S"] == S]:
            for k in tot[S]:
                tot[S][k] += c["count"][k]
    for n in fetch.ROBOTS:
        for H in HB:
            for S in SQ:
                c = [c for c in out["census"] if c["robot"] == n and c["H"] == H and c["S"] == S][0]
                print(f"  {n} {H:5.1f} {S:5.1f} | " + " / ".join(str(c["count"][k]) for k in tot[S]))
    for S in SQ:
        print(f"  total S {S:5.1f} | " + " / ".join(f"{k} {tot[S][k]}" for k in tot[S]))
    out["census_total"] = {str(S): tot[S] for S in SQ}
    print()

    def row(n, S, H, b):
        return [r for r in out["B"] if r["robot"] == n and r["S"] == S and r["H"] == H and r["b"] == b][0]

    print("## B. Worst residual along the wall |y| (and the worst |z|) in mm over poses, directions and signed axes: "
          "robot | H | |e| | S = " + " / ".join(f"{S:g}" for S in SQ) + " N  (milestone 37, m 0.1)")
    for n in fetch.ROBOTS:
        for H in HB:
            for b in BS:
                r37 = [x for x in m37["B"] if x["robot"] == n and x["m"] == 0.1 and x["H"] == H and x["b"] == b]
                ref = f"{abs(r37[0]['worst']['0.0']['y']) / MM:.3f}" if r37 else "-"
                ys = []
                for S in SQ:
                    w = row(n, S, H, b)["worst"]
                    ys.append("none" if w is None else f"{abs(w['y']) / MM:.3f} ({w.get('z', 0) / MM:.3f})")
                print(f"  {n} {H:5.1f} {b:4.1f} | " + " / ".join(ys) + f"   ({ref})")
    print()

    print("## B2. The squeeze at H 0, exact sensor: robot | S | poses with a plan | smallest arm margin over the poses "
          "(N m) | poses with margin >= 0.1 | largest |s| used (N) | largest arm |tau| / limit")
    for x in out["B2"]:
        ok = {k: v for k, v in x["poses"].items() if v is not None}
        mgs = [v["margin"] for v in ok.values() if v["arms"]]
        x["min_margin"] = min(mgs) if mgs else None
        x["n_ge_01"] = sum(1 for v in mgs if v >= 0.1)
        x["max_s"] = max(abs(v["s"]) for v in ok.values())
        x["max_use"] = max(v["max_arm_use"] for v in ok.values())
        x["over"] = {k: v["over_limit"] for k, v in ok.items() if v["over_limit"]}
        print(f"  {x['robot']} {x['S']:5.1f} | {len(ok)} | {x['min_margin']:.4f} | {x['n_ge_01']} of {len(mgs)} | "
              f"{x['max_s']:.2f} | {x['max_use']:.3f}")
    for x in [x for x in out["B2"] if x["S"] == 0.0]:
        print(f"  {x['robot']}: poses whose plan holds a moving arm joint over its MJCF limit with no squeeze: "
              + ("; ".join(f"{k} {', '.join(v)}" for k, v in x["over"].items()) or "none"))
    print()

    g1b = [(S, abs(row("g1", S, 5.0, 0.2)["worst"]["y"])) for S in SQ if row("g1", S, 5.0, 0.2)["worst"]]
    SSTAR = min(g1b, key=lambda x: (round(x[1] / MM, 3), x[0]))[0]
    out["S_star"] = SSTAR
    print(f"## D. Stack loss (points), H uniform over [0, H_max] in milestone 35's worst direction, FT 300 noise per "
          f"shot, |e| 0.2 N bias at H_max / 2, m 0.1; S* = {SSTAR:g} N (smallest S with section B's lowest G1 5 N "
          "residual): robot | H_max | S | loss | at  (milestone 37, m 0.1)")
    jobs = []
    for n in fetch.ROBOTS:
        for d35 in [x for x in m35["D"] if x["robot"] == n and x["H_max"] in (10.0, 20.0)]:
            for S in dict.fromkeys([0.0, SSTAR]):
                jobs.append((n, d35["H_max"], d35["phi"], S))
    with ctx.Pool(procs) as pool:
        out["D"] = pool.map(task_D, jobs, chunksize=1)
    for r in out["D"]:
        c37 = [x for x in m37["D"] if x["robot"] == r["robot"] and x["H_max"] == r["H_max"] and x["m"] == 0.1
               and x["g"] == 0.0]
        print(f"  {r['robot']} {r['H_max']:5.1f} | S {r['S']:g} | {100 * r['worst_loss']:6.2f} | at {r['at']}"
              + (f"  ({100 * c37[0]['worst_loss']:.2f})" if c37 else ""))
    print()

    print("## E. Hypotheses (registered in LOG.md before this run)")
    h141 = base < 1e-9 and nonarm < 1e-9
    print(f"H141 (the squeeze reaches only the arms: base and leg/waist < 1e-9 per N): {base:.1e}, {nonarm:.1e} -> "
          f"{'held' if h141 else 'refuted'}")
    x142 = [x for x in out["B2"] if x["robot"] == "g1" and x["S"] == 20.0]
    if x142:
        x142 = x142[0]
        h142 = x142["min_margin"] is not None and x142["min_margin"] >= 0.1
        print(f"H142 (S 20, H 0, exact: G1 smallest arm margin >= 0.1 N m at every pose): {x142['min_margin']:.4f} "
              f"({x142['n_ge_01']} poses at 0.1 or more) -> {'held' if h142 else 'refuted'}")
    else:
        h142 = None
    t20 = tot.get(20.0)
    if t20:
        h143 = t20["arm"] <= 4
        print(f"H143 (S 20, m 0.1, |e| 0.2: at most 4 arm flips; milestone 37 14): {t20['arm']} -> "
              f"{'held' if h143 else 'refuted'}")
        w = row("g1", 20.0, 5.0, 0.2)["worst"]
        h144 = abs(w["y"]) <= 0.5 * MM
        print(f"H144 (S 20, m 0.1, |e| 0.2, 5 N: G1 <= 0.5 mm; milestone 37 0.830): {abs(w['y']) / MM:.3f} mm -> "
              f"{'held' if h144 else 'refuted'}")
        left = sum(t20.values())
        h145 = left > 0 and t20["waist"] >= 0.5 * left
        print(f"H145 (S 20: at least half the remaining flips are waist joints): {t20['waist']} of {left} -> "
              f"{'held' if h145 else 'refuted'}")
    else:
        h143 = h144 = h145 = None
    out["E"] = {"H141": h141, "H142": h142, "H143": h143, "H144": h144, "H145": h145}

    json.dump(out, open(os.path.join(HERE, "results.json"), "w"), indent=1)
    print(f"\n(run time {time.time() - T0:.0f} s; python {platform.python_version()}, numpy {np.__version__}, "
          f"mujoco {mujoco.__version__})")
