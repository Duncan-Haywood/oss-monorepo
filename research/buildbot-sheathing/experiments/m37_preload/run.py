"""Milestone 37: a held-joint preload against the wrist sensor's floor (milestone 36).

Same setup as milestone 36 (leaned poses on 'hold-min', rubber hose as a catenary from the grip, horizontal
tension H in direction phi, k_t 1e4 on every joint, one calibration at milestone 30's pose in the same hose
state and sensor error). New here:

* the controller plans once, from the measured force f + e; the robot settles under the true force f by the
  min-norm change of contact forces that balances the base (``preload.settle``); the compensator predicts
  from the plan;
* 'hold-margin m': every leg joint at each press end pushed at least m from tau_f on its own side
  (``preload.margin_rows``), m in MARGINS;
* a hedged compensator: a quarter gap on joints planned within g of tau_f (``preload.hedged_bias``).

A. Which joints flip at m = 0 (hold set, other leg, waist, arm). B. Worst residual per m, |e| 0.2 and 2.4 N,
H 0, 5, 20 N; what the preload costs. C. The hedge. D. Stacks over 0-H_max with the FT 300's noise.
E. Hypotheses H136-H140 (registered in LOG.md before this run).

Reads ../m11_measured/profiles.json, ../m6b_bowed_edge/results.json, ../m27_slide_mech/results.json and
../m35_hose/results.json. Sections run in a process pool (fork; set M37_PROCS, default 4).
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
TRIALS = 2000 if os.environ.get("M37_SMOKE") else 20000
KT = [3e3, 1e4, 3e4, 1e5]          # transmission stiffness (N m / rad), every joint; swept, not sourced
KREG = 1e4                         # the registered k_t
HS = [0.0, 5.0, 10.0, 20.0]        # horizontal hose tension (N); milestone 35 swept 0-20
PHIS = [math.radians(a) for a in range(0, 360, 45)]   # direction the hose pulls (0 = towards the wall, 90 = +y)
MU_F = [0.3, 0.5, 0.8]             # hose-on-floor friction, not sourced
L_DRAG = [2.0, 5.0, 10.0]          # hose length lying on the floor that the robot drags (m), not sourced
out = {"versions": {"python": platform.python_version(), "numpy": np.__version__}, "x": X, "ref": REF,
       "tool_kg": TOOL_KG, "L": L0, "press": [F_HI / 2, F_HI], "kt": KT, "hoses": Ho.HOSES, "H": HS,
       "phi_deg": [round(math.degrees(p)) for p in PHIS]}

print("# Milestone 37: a held-joint preload against the wrist sensor's floor")

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
import multiprocessing as mp  # noqa: E402

HOSE = "rubber"
W_HOSE = Ho.HOSES[HOSE]
MARGINS = [0.0, 0.02, 0.05, 0.1, 0.15]           # preload margin m (N m); tau_f is 0.2, so m < tau_f
BS = [0.2, 2.4]                                  # |e| (N): 2 x FT 300 0.1 N, 2 x pre-2017 FT 300 1.2 N
GS = [0.0, 0.02, 0.05, 0.1]                      # hedge band g (N m)
HB = [0.0, 5.0, 20.0]
if os.environ.get("M37_SMOKE"):                  # a fast code check of every section; its numbers are not results
    HB, PHIS[:], MARGINS = [0.0, 5.0], PHIS[:2], [0.0, 0.1]
    KEYS[:] = [k for k in KEYS if k[2] == 0.0 or k[1:] == (1.0, 0.0)]
AXES = FT.AXES
NOISE = {k: np.array(v) for k, v in FT.SENSORS.items()}
out.update({"hose": HOSE, "margins": MARGINS, "b": BS, "g": GS, "H": HB, "model": "settle"})
m35 = json.load(open(os.path.join(HERE, "..", "m35_hose", "results.json")))
m36 = json.load(open(os.path.join(HERE, "..", "m36_wrist_ft", "results.json")))


def kind(n, j):
    """'hold' (milestone 32's set), 'leg', 'waist' or 'arm' for joint index j."""
    names, legs = ROB[n][1], ROB[n][2]
    if j in light(n):
        return "hold"
    if j in legs:
        return "leg"
    return "waist" if any(k in names[j] for k in ("waist", "torso")) else "arm"


PLANS = {}


def plan(key, f, e, m):
    """(t_act, t_plan): the robot's torques after settling under the true force f, and the controller's plan
    from the measured force f + e with margin m, at the two press ends; None if the plan has no solution."""
    k = (key, tuple(np.round(f, 9)), tuple(np.round(e, 9)), m)
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
        if m > 0:
            rows, kap, d = PL.margin_rows(cm.tau(fn), legs, TAUF)
            fn = PL.solve_margin(cm, legs, rows, kap, d, m)
            if fn is None:
                break
        ct = contact(r, q, F, TOOL_KG, np.asarray(f, float))
        tp.append(cm.tau(fn))
        ta.append(ct.tau(PL.settle(ct, fn)))
    else:
        res = (ta, tp)
    PLANS[k] = res
    return res


def joint_err(key, f, e, m, g):
    p = plan(key, f, e, m)
    if p is None:
        return None
    ta, tp = p
    err = FT.joint_error(ta, tp, TQ[key], TAUF, GAPR, KREG, 0.0)
    return err + PR.held_bias(tp[0], tp[1], TAUF, GAPR) - PL.hedged_bias(tp[0], tp[1], TAUF, GAPR, g)


def hose_f(key, H, phi):
    return Ho.force(GRIP[key], H, W_HOSE, phi)


def residuals(n, H, phi, e, m, gs):
    """{g: {pose: residual dict}} after one calibration at milestone 30's pose."""
    ref = (n,) + REF
    outg = {}
    for g in gs:
        er = joint_err(ref, hose_f(ref, H, phi), e, m, g)
        if er is None:
            outg[g] = {}
            continue
        res = {}
        for key in [k for k in KEYS if k[0] == n]:
            ep = joint_err(key, hose_f(key, H, phi), e, m, g)
            if ep is not None:
                res[key] = C.compensated(POSE[key].rows[:2], POSE[ref].rows[:2], ep, er, L0)
        outg[g] = res
    return outg


def phis_for(H):
    return list(range(len(PHIS))) if H > 0 else [0]


def task_B(args):
    """Worst |y|, |z| per (H, |e|, g) for robot n at margin m, the flip census (m = 0, |e| 0.2) and costs."""
    n, m = args
    t1 = time.time()
    rows, census = [], []
    for H in HB:
        for b in BS:
            best = {g: None for g in GS}
            per_pose = {}                         # pose -> (|y|, phi, e) worst, for the census (g = 0)
            solved = set()
            for i in phis_for(H):
                phi = PHIS[i] if H > 0 else 0.0
                for a in AXES:
                    e = b * a
                    rg = residuals(n, H, phi, e, m, GS)
                    for g in GS:
                        for key, mu in rg[g].items():
                            solved.add(key)
                            if best[g] is None or abs(mu["y"][0]) > abs(best[g]["y"]):
                                best[g] = {"y": mu["y"][0], "z_at": mu["z"][0], "at": list(key[1:]),
                                           "phi": round(math.degrees(phi)), "e": [float(x) for x in e]}
                            if g == 0.0 and (key not in per_pose or abs(mu["y"][0]) > per_pose[key][0]):
                                per_pose[key] = (abs(mu["y"][0]), phi, e)
                    for g in GS:
                        zs = [abs(mu["z"][0]) for mu in rg[g].values()]
                        if zs and (best[g] is not None):
                            best[g]["z"] = max(best[g].get("z", 0.0), max(zs))
            rows.append({"robot": n, "m": m, "H": H, "b": b, "poses": len(solved),
                         "worst": {str(g): best[g] for g in GS}})
            if b == 0.2:
                cnt = {"hold": 0, "leg": 0, "waist": 0, "arm": 0}
                for key, (_, phi, e) in per_pose.items():
                    ta, tp = plan(key, hose_f(key, H, phi), e, m)
                    for j in np.flatnonzero(PL.flips(ta, tp, TAUF) & POSE[key].rows[2]):
                        cnt[kind(n, j)] += 1
                census.append({"robot": n, "m": m, "H": H, "count": cnt})
    # cost at H 0, exact sensor: poses with a plan, the largest leg |tau|
    legs = ROB[n][2]
    cost = {}
    for key in [k for k in KEYS if k[0] == n]:
        p = plan(key, np.zeros(3), np.zeros(3), m)
        cost[str(list(key[1:]))] = None if p is None else float(max(np.max(np.abs(t[legs])) for t in p[1]))
    return {"n": n, "m": m, "rows": rows, "census": census, "cost": cost, "s": time.time() - t1}


def noise_span(key, f, sig, m, g):
    """Uniform-equivalent span of the nose's per-shot error from sensor noise sig (1 sigma per axis),
    linearised per axis through the plan and the settle model."""
    parts = []
    for a, s in zip(AXES[0::2], sig):
        dq = joint_err(key, f, s * a, m, g)
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
    """Worst stack loss over the poses for robot n, H_max, case (m, g), FT 300 noise, |e| 0.2 bias."""
    n, hm, phi_deg, m, g = args
    phi = math.radians(phi_deg)
    rrs = [residuals(n, hm / 2, phi, 0.2 * a, m, [g])[g] for a in AXES]
    losses = {}
    for key in [k for k in KEYS if k[0] == n]:
        cand = [rr[key] for rr in rrs if key in rr]
        if not cand:
            continue
        best = max(cand, key=lambda x: abs(x["y"][0]))
        sp = noise_span(key, hose_f(key, hm / 2, phi), NOISE["ft300"], m, g)
        if sp is None:
            continue
        losses[key] = V(key) - V(key, best, sp)
    wk = max(losses, key=losses.get)
    return {"robot": n, "H_max": hm, "phi": phi_deg, "m": m, "g": g, "worst_loss": losses[wk],
            "at": list(wk[1:]), "poses": len(losses)}


if __name__ == "__main__":
    k0 = ("g1",) + REF
    p0 = plan(k0, hose_f(k0, 5.0, 0.0), np.zeros(3), 0.0)
    out["check_settle_exact"] = float(max(np.max(np.abs(p0[0][j] - p0[1][j])) for j in (0, 1)))
    print(f"check: with an exact sensor the settled torques equal the plan to {out['check_settle_exact']:.1e} N m "
          "(expect 0)")
    t36 = tq36 = torques("g1", k0, SIGNS["g1"], hose_f(k0, 5.0, 0.0))
    out["check_m0_plan"] = float(max(np.max(np.abs(p0[1][j] - t36[j])) for j in (0, 1)))
    print(f"check: the m = 0 plan reproduces milestone 36's 'hold-min' torques to {out['check_m0_plan']:.1e} N m "
          "(expect 0)")
    pm = plan(k0, hose_f(k0, 5.0, 0.0), np.zeros(3), 0.1)
    legs = ROB["g1"][2]
    if pm is not None:
        gapm = min(float(np.min(np.abs(np.abs(t[legs]) - TAUF))) for t in pm[1])
        out["check_margin"] = gapm
        print(f"check: at m = 0.1 every G1 leg joint at the reference pose is {gapm:.4f} N m or more from tau_f "
              "(expect >= 0.1)")
    print()

    procs = int(os.environ.get("M37_PROCS", "4"))
    ctx = mp.get_context("fork")
    with ctx.Pool(procs) as pool:
        resB = pool.map(task_B, [(n, m) for m in MARGINS for n in fetch.ROBOTS], chunksize=1)
    out["B"] = [r for x in resB for r in x["rows"]]
    out["census"] = [c for x in resB for c in x["census"]]
    out["cost"] = [{"robot": x["n"], "m": x["m"], "max_leg_tau": x["cost"]} for x in resB]
    print("(section B tasks: " + ", ".join(f"{x['n']} m {x['m']:g} {x['s']:.0f} s" for x in resB) + ")")
    print()

    print("## A. Which joints flip under the settle model at m = 0, |e| 0.2 N (per pose its worst direction and "
          "signed axis; moving joints): robot | H | hold set / other leg / waist / arm")
    tot = {"hold": 0, "leg": 0, "waist": 0, "arm": 0}
    for c in [c for c in out["census"] if c["m"] == 0.0]:
        print(f"  {c['robot']} {c['H']:5.1f} | " + " / ".join(str(c["count"][k]) for k in tot))
        for k in tot:
            tot[k] += c["count"][k]
    out["census_total"] = tot
    print(f"  total | " + " / ".join(f"{k} {tot[k]}" for k in tot))
    print("  post hoc (not registered): the same census with the preload, totals over both robots and H: m | "
          "hold set / other leg / waist / arm")
    for m in MARGINS[1:]:
        tm = {k: sum(c["count"][k] for c in out["census"] if c["m"] == m) for k in tot}
        print(f"  {m:4.2f} | " + " / ".join(str(tm[k]) for k in tot))
    print()

    def row(n, m, H, b):
        return [r for r in out["B"] if r["robot"] == n and r["m"] == m and r["H"] == H and r["b"] == b][0]

    print("## B. Worst residual along the wall |y| (and the worst |z|) in mm over poses, directions and signed axes, "
          "plain compensator (g 0): robot | H | |e| | m = " + " / ".join(f"{m:g}" for m in MARGINS) + " N m  "
          "(milestone 36, re-solve model, m 0)")
    for n in fetch.ROBOTS:
        for H in HB:
            for b in BS:
                a36 = [x for x in m36["A"] if x["robot"] == n and x["H"] == H]
                ref36 = f"{a36[0][str(b)]['y'] / MM:+.3f}" if a36 else "-"
                ys = []
                for m in MARGINS:
                    w = row(n, m, H, b)["worst"]["0.0"]
                    ys.append("none" if w is None else f"{abs(w['y']) / MM:.3f} ({w.get('z', 0) / MM:.3f})")
                print(f"  {n} {H:5.1f} {b:4.1f} | " + " / ".join(ys) + f"   ({ref36})")
    print()
    print("## B2. Cost of the preload at H 0, exact sensor: robot | m | poses with a plan | largest leg |tau| "
          "over the poses (N m) | largest rise at a pose against m = 0 (%)")
    for n in fetch.ROBOTS:
        base = [c for c in out["cost"] if c["robot"] == n and c["m"] == 0.0][0]["max_leg_tau"]
        for c in [c for c in out["cost"] if c["robot"] == n]:
            mt = c["max_leg_tau"]
            ok = [k for k in mt if mt[k] is not None]
            rise = [100 * (mt[k] / base[k] - 1) for k in ok if base.get(k)]
            c["poses"], c["rise_pct"] = len(ok), max(rise) if rise else None
            c["lost"] = [k for k in base if base[k] is not None and mt.get(k) is None]
            print(f"  {n} {c['m']:5.2f} | {len(ok)} (lost {c['lost'] or 'none'}) | "
                  f"{max(mt[k] for k in ok):.2f} | {c['rise_pct']:.2f}")
    print()

    print("## C. The hedge: worst |y| (mm) with the hedged compensator, band g = " + " / ".join(f"{g:g}" for g in GS)
          + " N m: robot | H | |e| | m")
    for n in fetch.ROBOTS:
        for H in HB:
            for b in BS:
                for m in MARGINS:
                    w = row(n, m, H, b)["worst"]
                    print(f"  {n} {H:5.1f} {b:4.1f} {m:4.2f} | " + " / ".join(
                        "none" if w[str(g)] is None else f"{abs(w[str(g)]['y']) / MM:.3f}" for g in GS))
    print()

    # the m section B picks: smallest m with the G1 at H 5, |e| 0.2 within 0.1 mm, else the best
    g1b = [(m, abs(row("g1", m, 5.0, 0.2)["worst"]["0.0"]["y"])) for m in MARGINS
           if row("g1", m, 5.0, 0.2)["worst"]["0.0"] is not None]
    within = [m for m, y in g1b if y <= 0.1 * MM]
    MSTAR = within[0] if within else min(g1b, key=lambda x: x[1])[0]
    out["m_star"] = MSTAR
    print(f"## D. Stack loss (points), H uniform over [0, H_max] in milestone 35's worst direction, FT 300 noise "
          f"per shot, |e| 0.2 N bias at H_max / 2; m* = {MSTAR:g} N m (section B's pick): robot | H_max | case | loss | at"
          "  (milestone 36, re-solve, FT 300)")
    cases = [(0.0, 0.0), (MSTAR, 0.0), (0.0, 0.05), (MSTAR, 0.05)]
    jobs = []
    for n in fetch.ROBOTS:
        for d35 in [x for x in m35["D"] if x["robot"] == n and x["H_max"] in (10.0, 20.0)]:
            for m, g in dict.fromkeys(cases):
                jobs.append((n, d35["H_max"], d35["phi"], m, g))
    with ctx.Pool(procs) as pool:
        out["D"] = pool.map(task_D, jobs, chunksize=1)
    for r in out["D"]:
        c36 = [x for x in m36["C"] if x["robot"] == r["robot"] and x["H_max"] == r["H_max"] and x["case"] == "ft300"]
        print(f"  {r['robot']} {r['H_max']:5.1f} | m {r['m']:g}, g {r['g']:g} | {100 * r['worst_loss']:6.2f} | at {r['at']}"
              + (f"  ({100 * c36[0]['worst_loss']:.2f})" if c36 else ""))
    print()

    print("## E. Hypotheses (registered in LOG.md before this run)")
    legs_share = (tot["hold"] + tot["leg"]) / max(1, sum(tot.values()))
    h136 = legs_share >= 0.5
    print(f"H136 (at least half the flips are leg joints, m 0, |e| 0.2, both robots, H 0/5/20): "
          f"{tot['hold'] + tot['leg']} of {sum(tot.values())} ({100 * legs_share:.0f}%) -> {'held' if h136 else 'refuted'}")
    w137 = row("g1", 0.1, 5.0, 0.2)["worst"]["0.0"]
    h137 = w137 is not None and abs(w137["y"]) <= 0.1 * MM
    print(f"H137 (m 0.1, |e| 0.2, 5 N: G1 <= 0.1 mm): {abs(w137['y']) / MM:.3f} mm -> {'held' if h137 else 'refuted'}")
    c01 = [c for c in out["cost"] if c["robot"] == "g1" and c["m"] == 0.1][0]
    h138 = not c01["lost"] and c01["rise_pct"] <= 10.0
    print(f"H138 (m 0.1 loses no G1 pose at H 0 and raises the largest leg |tau| by <= 10%): lost "
          f"{c01['lost'] or 'none'}, rise {c01['rise_pct']:.2f}% -> {'held' if h138 else 'refuted'}")
    w139 = row("g1", 0.1, 5.0, 2.4)["worst"]["0.0"]
    h139 = abs(w139["y"]) > 0.3 * MM
    print(f"H139 (m 0.1, |e| 2.4, 5 N: G1 > 0.3 mm): {abs(w139['y']) / MM:.3f} mm -> {'held' if h139 else 'refuted'}")
    wp, wh = row("g1", 0.0, 5.0, 0.2)["worst"]["0.0"], row("g1", 0.0, 5.0, 0.2)["worst"]["0.05"]
    h140 = abs(wh["y"]) <= 0.5 * abs(wp["y"])
    print(f"H140 (hedge g 0.05, m 0, |e| 0.2, 5 N: G1 <= half the plain): {abs(wh['y']) / MM:.3f} against "
          f"{abs(wp['y']) / MM:.3f} mm -> {'held' if h140 else 'refuted'}")
    out["E"] = {"H136": h136, "H137": h137, "H138": h138, "H139": h139, "H140": h140}

    json.dump(out, open(os.path.join(HERE, "results.json"), "w"), indent=1)
    print(f"\n(run time {time.time() - T0:.0f} s; python {platform.python_version()}, numpy {np.__version__}, "
          f"mujoco {mujoco.__version__})")
