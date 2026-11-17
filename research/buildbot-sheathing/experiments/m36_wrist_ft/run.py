"""Milestone 36: a wrist force-torque sensor as the remedy for the air hose (milestone 35).

Same setup as milestone 35 (leaned poses on 'hold-min', rubber hose as a catenary from the grip, horizontal
tension H in direction phi, k_t 1e4 on every joint). The robot's actual torques are the QP solution under the
true hose force f; a compensator that reads a wrist F/T sensor predicts them from the QP under f + e (e the
sensor's error). The joint-space error is the backlash misprediction delta(t) - delta(t_hat) plus the windup
error, true windup at k_t minus predicted windup at k_t (1 + eps); one calibration at milestone 30's pose in the
same hose state with the same sensor error.
A. Residual along the wall (y) and vertically (z), worst pose, worst of the six signed axis directions of e,
   |e| in {0, 0.125, 0.2, 0.5, 1.0, 2.4} N, against no sensor (milestone 35's compensator plus windup).
B. An exact sensor with k_t misjudged by +-25%.
C. Stack with H uniform over [0, H_max] (milestone 35's D directions): sensor noise per shot (linearised through
   the QP, per axis) and the k_t error's share of the windup spread as scatter; the residual at H_max / 2 as bias.
D. Hypotheses H132-H135 (registered in LOG.md before this run).

Reads ../m11_measured/profiles.json, ../m6b_bowed_edge/results.json, ../m27_slide_mech/results.json and
../m35_hose/results.json.
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
TRIALS = 2000 if os.environ.get("M36_SMOKE") else 20000
KT = [3e3, 1e4, 3e4, 1e5]          # transmission stiffness (N m / rad), every joint; swept, not sourced
KREG = 1e4                         # the registered k_t
HS = [0.0, 5.0, 10.0, 20.0]        # horizontal hose tension (N); milestone 35 swept 0-20
PHIS = [math.radians(a) for a in range(0, 360, 45)]   # direction the hose pulls (0 = towards the wall, 90 = +y)
MU_F = [0.3, 0.5, 0.8]             # hose-on-floor friction, not sourced
L_DRAG = [2.0, 5.0, 10.0]          # hose length lying on the floor that the robot drags (m), not sourced
out = {"versions": {"python": platform.python_version(), "numpy": np.__version__}, "x": X, "ref": REF,
       "tool_kg": TOOL_KG, "L": L0, "press": [F_HI / 2, F_HI], "kt": KT, "hoses": Ho.HOSES, "H": HS,
       "phi_deg": [round(math.degrees(p)) for p in PHIS]}

print("# Milestone 36: a wrist force-torque sensor as the hose's remedy")

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


HOSE = "rubber"
W_HOSE = Ho.HOSES[HOSE]
BS = [0.0, 0.125, 0.2, 0.5, 1.0, 2.4]          # |e| (N): exact, 2 x ATI Mini45 1/16 N, 2 x FT 300 0.1 N, swept, swept, 2 x pre-2017 FT 300 1.2 N
EPS = [0.25, -0.25]
if os.environ.get("M36_SMOKE"):                  # a fast code check of every section; its numbers are not results
    HS, BS, PHIS[:] = [0.0, 5.0], [0.0, 0.2, 2.4], PHIS[:2]
    KEYS[:] = [k for k in KEYS if k[2] == 0.0 or k[1:] == (1.0, 0.0)]                              # k_t misjudged by +-25%
AXES = FT.AXES
NOISE = {k: np.array(v) for k, v in FT.SENSORS.items()}   # 1 sigma per axis (N); Mini45: its resolution, a proxy
out.update({"hose": HOSE, "H": HS, "b": BS, "eps": EPS, "noise": {k: v.tolist() for k, v in NOISE.items()}})
m35 = json.load(open(os.path.join(HERE, "..", "m35_hose", "results.json")))

TQC = {}


def tq(key, f):
    """Torques at the two press ends with a force f at the grip (cached)."""
    k = (key, tuple(np.round(f, 9)))
    if k not in TQC:
        TQC[k] = torques(key[0], key, SIGNS[key[0]], np.asarray(f, float))
    return TQC[k]


def delta(t):
    return PR.held_bias(t[0], t[1], TAUF, GAPR)


def mean_dt(t, key):
    return FT.mean_change(t, TQ[key])


def AB(key):
    jp, jr = POSE[key].rows[:2]
    return WU.nose_rows(jp, jr, L0)


def hose_f(key, H, phi):
    return Ho.force(GRIP[key], H, W_HOSE, phi)


def joint_err(key, f, e, eps):
    """Actual minus predicted joint error (rad), or None if a QP has no solution. e None: no sensor
    (milestone 35's compensator, no-hose model, windup unpredicted)."""
    t = tq(key, f)
    if t is None:
        return None
    if e is None:
        return FT.joint_error(t, TQ[key], TQ[key], TAUF, GAPR, KREG, math.inf)
    th = tq(key, f + e)
    if th is None:
        return None
    return FT.joint_error(t, th, TQ[key], TAUF, GAPR, KREG, eps)


def residual(n, H, phi, e, eps=0.0):
    """Per-pose residual dicts after one calibration at milestone 30's pose (same hose state, same e)."""
    ref = (n,) + REF
    er = joint_err(ref, hose_f(ref, H, phi), e, eps)
    if er is None:
        return {}
    res = {}
    for key in [k for k in KEYS if k[0] == n]:
        ep = joint_err(key, hose_f(key, H, phi), e, eps)
        if ep is not None:
            res[key] = C.compensated(POSE[key].rows[:2], POSE[ref].rows[:2], ep, er, L0)
    return res


def phis_for(H):
    return list(range(len(PHIS))) if H > 0 else [0]


def worst(n, H, es, eps=0.0):
    """Worst |y| (and |z|) over poses, directions phi and sensor errors es."""
    by, bz = None, None
    for i in phis_for(H):
        for e in es:
            for key, mu in residual(n, H, PHIS[i] if H > 0 else 0.0, e, eps).items():
                tag = {"z": key[1], "dy": key[2], "phi": round(math.degrees(PHIS[i])) if H > 0 else None,
                       "e": None if e is None else [float(x) for x in e]}
                if by is None or abs(mu["y"][0]) > abs(by[0]):
                    by = (mu["y"][0], tag)
                if bz is None or abs(mu["z"][0]) > abs(bz[0]):
                    bz = (mu["z"][0], tag)
    return {"y": by[0], "at_y": by[1], "z": bz[0], "at_z": bz[1]}


k0 = ("g1",) + REF
out["check_exact_sensor"] = float(max(np.max(np.abs(joint_err(k, hose_f(k, 5.0, 0.0), np.zeros(3), 0.0)))
                                      for k in KEYS if k[0] == "g1" and tq(k, hose_f(k, 5.0, 0.0)) is not None))
print(f"check: an exact sensor with k_t known leaves a joint error of {out['check_exact_sensor']:.1e} rad (expect 0)")
t_one = time.time()
print()

# ------------------------------------------------------------------ A. residual with a sensor
print("## A. Residual after compensation from the sensor and one calibration (mm), worst pose, direction phi and "
      "signed axis of e: robot | H (N) | no sensor | |e| = " + " / ".join(f"{b:g}" for b in BS) + " N  (y along the wall; z)")
out["A"] = []
for n in fetch.ROBOTS:
    for H in HS:
        row = {"robot": n, "H": H, "none": worst(n, H, [None])}
        for b in BS:
            row[str(b)] = worst(n, H, [b * a for a in AXES] if b > 0 else [np.zeros(3)])
        out["A"].append(row)
        print(f"  {n} {H:5.1f} | y {row['none']['y'] / MM:+.3f} | " + " / ".join(f"{row[str(b)]['y'] / MM:+.3f}" for b in BS)
              + f"   z {row['none']['z'] / MM:+.3f} | " + " / ".join(f"{row[str(b)]['z'] / MM:+.3f}" for b in BS))
print(f"  worst cases (G1, H 5): no sensor at {[r for r in out['A'] if r['robot'] == 'g1' and r['H'] == 5.0][0]['none']['at_y']}; "
      f"|e| 0.2 at {[r for r in out['A'] if r['robot'] == 'g1' and r['H'] == 5.0][0]['0.2']['at_y']}; "
      f"|e| 2.4 at {[r for r in out['A'] if r['robot'] == 'g1' and r['H'] == 5.0][0]['2.4']['at_y']}")
print(f"(section A: {time.time() - t_one:.0f} s, {len(TQC)} QP solves cached)")
print()

# ------------------------------------------------------------------ A2. why a good sensor leaves a floor (post hoc)
print("## A2. Post hoc (added after section A's first rows, not registered): why the residual does not shrink with the "
      "sensor. G1, H 5 N, section A's worst direction for |e| 0.2 N; per |e|, the worst |y| over the six signed axes "
      "(mm) | joints mispredicted, wrong / spurious / missed (worst axis, summed over poses) | the flipped joints' "
      "|tau| distance from tau_f (N m, smallest and largest)")
a5w = [r for r in out["A"] if r["robot"] == "g1" and r["H"] == 5.0][0]["0.2"]["at_y"]
phiE = math.radians(a5w["phi"])
out["A2"] = {"phi": a5w["phi"], "rows": []}
for b in [0.001, 0.01, 0.05, 0.2, 2.4]:
    best = None
    for e in [b * a for a in AXES]:
        rr = residual("g1", 5.0, phiE, e)
        if not rr:
            continue
        ky = max(rr, key=lambda k: abs(rr[k]["y"][0]))
        cl, dist = [0, 0, 0], []
        for key in rr:
            f = hose_f(key, 5.0, phiE)
            t, th = tq(key, f), tq(key, f + e)
            d, dh = delta(t), delta(th)
            c = C.classify(d, dh, POSE[key].rows[2])
            cl = [x + y for x, y in zip(cl, c)]
            for j in np.flatnonzero((d != dh) & POSE[key].rows[2]):
                dist.append(float(min(abs(abs(t[0][j]) - TAUF), abs(abs(t[1][j]) - TAUF))))
        if best is None or abs(rr[ky]["y"][0]) > abs(best["y"]):
            best = {"b": b, "y": rr[ky]["y"][0], "at": list(ky[1:]), "e": [float(x) for x in e], "cl": cl,
                    "dist": [min(dist), max(dist)] if dist else None}
    out["A2"]["rows"].append(best)
    dd = f"{best['dist'][0]:.4f}-{best['dist'][1]:.4f}" if best["dist"] else "none"
    print(f"  |e| {b:6.3f} N | y {best['y'] / MM:+.3f} at {best['at']} | {best['cl'][0]}/{best['cl'][1]}/{best['cl'][2]} | {dd}")
print()

# ------------------------------------------------------------------ B. k_t misjudged
print("## B. Exact sensor, k_t misjudged (the compensator's windup model at k_t (1 + eps)): worst |y| and |z| (mm): "
      "robot | H | eps +0.25 | eps -0.25")
out["B"] = []
for n in fetch.ROBOTS:
    for H in HS:
        row = {"robot": n, "H": H}
        for eps in EPS:
            row[str(eps)] = worst(n, H, [np.zeros(3)], eps)
        out["B"].append(row)
        print(f"  {n} {H:5.1f} | " + " | ".join(f"y {row[str(e)]['y'] / MM:+.3f} z {row[str(e)]['z'] / MM:+.3f}" for e in EPS))
print()

# ------------------------------------------------------------------ C. stacks
print("## C. Stack loss (points) with H uniform over [0, H_max] in milestone 35's worst direction (its section D), "
      "k_t 1e4, against the matched stack with no hose; worst pose: robot | H_max | case | loss | at")


def V(key, bias=None, span=None):
    t = TQ[key]
    loose = ~B.held(t[0], t[1], TAUF)
    err = B.from_rows(POSE[key].rows[0], POSE[key].rows[1], B.joint_sigmas(T.quant_sigma(12), GAPR, loose), L0)
    if bias is not None:
        err = PR.with_bias(err, bias)
    if span is not None:
        err = WU.with_scatter(err, span)
    return stack(err)


span_of = FT.combine_spans


def noise_span(key, f, sig):
    """Uniform-equivalent span (sqrt(12) sigma) of the nose's per-shot error from sensor noise sig (N per axis),
    linearised: the predicted windup and held sides move with the measured force."""
    t0 = tq(key, f)
    parts = []
    for a, s in zip(AXES[0::2], sig):
        th = tq(key, f + s * a)
        if th is None or t0 is None:
            return None
        dq = (delta(t0) - delta(th)) - WU.free_windup(mean_dt(th, key) - mean_dt(t0, key), KREG)
        parts.append(FT.uniform_equivalent(WU.offsets(*AB(key), dq)))
    return span_of(*parts)


V0 = {key: V(key) for key in KEYS}
CASES = [("none", None, None, 0.0), ("ft300", 0.2, "ft300", 0.0), ("mini45", 0.125, "mini45", 0.0),
         ("ft300_pre2017", 2.4, "ft300_pre2017", 0.0), ("exact, k_t +25%", 0.0, None, 0.25),
         ("exact, k_t -25%", 0.0, None, -0.25)]
out["C"] = []
for n in fetch.ROBOTS:
    ref = (n,) + REF
    ks = [k for k in KEYS if k[0] == n]
    for d35 in [x for x in m35["D"] if x["robot"] == n]:
        hm, phi = d35["H_max"], math.radians(d35["phi"])
        for name, b, noise, eps in CASES:
            es = [None] if b is None else ([b * a for a in AXES] if b > 0 else [np.zeros(3)])
            rrs = [residual(n, hm / 2, phi, e, eps) for e in es]
            losses = {}
            for key in ks:
                f_mid, f_max = hose_f(key, hm / 2, phi), hose_f(key, hm, phi)
                if tq(key, f_max) is None or tq(key, f_mid) is None:
                    continue
                # the bias: the residual at H_max / 2, worst signed axis of e at this pose
                best = None
                for rr in rrs:
                    if key in rr and (best is None or abs(rr[key]["y"][0]) > abs(best["y"][0])):
                        best = rr[key]
                if best is None:
                    continue
                full = WU.offsets(*AB(key), WU.free_windup(mean_dt(tq(key, f_max), key), KREG))
                if b is None:
                    sp = full                         # milestone 35: the whole windup spread is unmodelled
                else:
                    share = FT.kt_share(eps)          # the part of the windup the misjudged model leaves
                    parts = [{ax: (share * full[ax][0], share * full[ax][1]) for ax in ("y", "z")}]
                    if noise is not None:
                        ns = noise_span(key, f_mid, NOISE[noise])
                        if ns is None:
                            continue
                        parts.append(ns)
                    sp = span_of(*parts)
                losses[key] = V0[key] - V(key, best, sp)
            wk = max(losses, key=losses.get)
            rec = {"robot": n, "H_max": hm, "phi": d35["phi"], "case": name, "worst_loss": losses[wk],
                   "at": list(wk[1:]), "poses": len(losses), "m35_loss": d35["worst_loss"]}
            out["C"].append(rec)
            print(f"  {n} {hm:5.1f} | {name:16s} | {100 * rec['worst_loss']:6.2f} | at {rec['at']}"
                  + (f"  (milestone 35: {100 * d35['worst_loss']:.2f})" if name == "none" else ""))
print()

# ------------------------------------------------------------------ D. hypotheses
print("## D. Hypotheses (registered in LOG.md before this run)")
a5 = [r for r in out["A"] if r["robot"] == "g1" and r["H"] == 5.0][0]
h132 = abs(a5["0.2"]["y"]) <= 0.1 * MM
print(f"H132 (|e| 0.2 N, k_t known, 5 N drag: <= 0.1 mm along the wall): {a5['0.2']['y'] / MM:+.3f} mm -> "
      f"{'held' if h132 else 'refuted'}")
h133 = abs(a5["2.4"]["y"]) > 0.3 * MM
print(f"H133 (|e| 2.4 N, k_t known, 5 N drag: > 0.3 mm): {a5['2.4']['y'] / MM:+.3f} mm -> {'held' if h133 else 'refuted'}")
b5 = [r for r in out["B"] if r["robot"] == "g1" and r["H"] == 5.0][0]
h134 = all(abs(b5[str(e)]["y"]) > 0.3 * MM for e in EPS)
print(f"H134 (exact sensor, k_t +-25%, 5 N drag: > 0.3 mm both ways): +25% {b5['0.25']['y'] / MM:+.3f}, "
      f"-25% {b5['-0.25']['y'] / MM:+.3f} mm -> {'held' if h134 else 'refuted'}")
c20 = [r for r in out["C"] if r["robot"] == "g1" and r["H_max"] == 20.0 and r["case"] == "ft300"][0]
h135 = c20["worst_loss"] <= 0.02
print(f"H135 (FT 300 noise, k_t known, drag 0-20 N: <= 2 points): {100 * c20['worst_loss']:.2f} points at {c20['at']} "
      f"-> {'held' if h135 else 'refuted'}")
out["D"] = {"H132": h132, "H133": h133, "H134": h134, "H135": h135}

json.dump(out, open(os.path.join(HERE, "results.json"), "w"), indent=1)
print(f"\n(run time {time.time() - T0:.0f} s; python {platform.python_version()}, numpy {np.__version__}, "
      f"mujoco {mujoco.__version__})")
