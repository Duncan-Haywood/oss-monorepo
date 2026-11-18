"""Milestone 34: deflection under the press, from the joints' elastic windup.

On milestone 32's leaned poses (G1 15, H1 20-21; robot balancing on 'hold-min', milestone 33's matched case):
A. Press windup per pose: dtau over the 25-50 N press, the joints' deflection with the nose free and with
   it stuck (pinned), at the nose and the 44.4 mm depth point, per transmission stiffness k_t (swept; no
   published value for these robots).
B. Whether the nose sticks: the friction coefficient the pinning reaction needs, per pose (independent of
   a k_t common to every joint).
C. Stacks (single 2x, 12 bits, 5 arcmin on loose joints, held joints compensated by the matched model,
   20,000 trials) with the press uniform over the window, against the same stack with no windup; the k_t
   that keeps the worst pose within 2 points.
D. The mean windup at 37.5 N as a pose bias: what one calibration at milestone 30's pose leaves.
E. Servo droop: a full 64-nail 8d magazine (0.295 kg, milestone 33) left out of the feedforward, under
   Unitree's PD gains (humanoid.GAINS), at the free nose.
F. Hypotheses H124-H127 (registered in LOG.md before this run).

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
KSPEC = [10 ** e for e in np.arange(3.0, 5.51, 0.25)]
MAG_KG = 0.295                     # 64 x 8d common nails (milestone 33, from steel density and nail size)
MU_REG = 0.4                       # nose-on-OSB friction, not sourced; the registered case
out = {"versions": {"python": platform.python_version(), "numpy": np.__version__}, "x": X, "ref": REF,
       "tool_kg": TOOL_KG, "L": L0, "press": [F_HI / 2, F_HI], "kt": KT}

print("# Milestone 34: deflection under the press (elastic windup, servo droop, a stuck nose)")

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

GAPR = GAP * AM
R = "hold-min"
TQ, TQM = {}, {}
for key in POSE:
    TQ[key] = torques(key[0], key, R, TOOL_KG, SIGNS[key[0]])
    TQM[key] = torques(key[0], key, R, TOOL_KG + MAG_KG, SIGNS[key[0]])
KEYS = [k for k in POSE if TQ[k] is not None]
skipped = sorted(set(POSE) - set(KEYS))
out["skipped"] = [list(k) for k in skipped]
print(f"poses with a 'hold-min' solution: {len(KEYS)} (skipped: {skipped or 'none'})")
print()


def AB(key):
    jp, jr = POSE[key].rows[:2]
    return WU.nose_rows(jp, jr, L0)


def V(key, span=None):
    """Stack at a pose: 12 bits, 5 arcmin on loose joints, held joints compensated by the matched model
    (milestone 33: no bias left), plus the press scatter ``span`` if given."""
    t = TQ[key]
    loose = ~B.held(t[0], t[1], 0.2)
    err = B.from_rows(POSE[key].rows[0], POSE[key].rows[1], B.joint_sigmas(T.quant_sigma(12), GAPR, loose), L0)
    return stack(err if span is None else WU.with_scatter(err, span))


def press(key, k, mode):
    """Joint deflection over the 25-50 N window (rad) and the nose reaction (N)."""
    dtau = TQ[key][1] - TQ[key][0]
    A, _ = AB(key)
    if mode == "free":
        return WU.free_windup(dtau, k), None
    if mode == "slip":                  # friction-limited at MU_REG (dtau per newton, scaled back)
        dq, sfrac = WU.friction_limited(dtau / (F_HI / 2), k, A, MU_REG)
        return dq * (F_HI / 2), sfrac
    return WU.stuck_windup(dtau, k, A)


def mm(o):
    return math.hypot(o["y"][0], o["z"][0]) / MM, math.hypot(o["y"][1], o["z"][1]) / MM


# ------------------------------------------------------------------ A. press windup at the nose
print("## A. Press windup over 25-50 N, worst pose per robot: k_t (N m/rad) | free nose: surface / depth (mm) | "
      "stuck nose: surface / depth (mm)")
out["A"] = []
for n in fetch.ROBOTS:
    ks = [k for k in KEYS if k[0] == n]
    for kt in KT:
        rec = {"robot": n, "kt": kt, "per_pose": []}
        for key in ks:
            A, Bd = AB(key)
            of = WU.offsets(A, Bd, press(key, kt, "free")[0])
            os_ = WU.offsets(A, Bd, press(key, kt, "stuck")[0])
            rec["per_pose"].append({"z": key[1], "dy": key[2], "free": of, "stuck": os_})
        wf = max(rec["per_pose"], key=lambda x: mm(x["free"])[0])
        ws = max(rec["per_pose"], key=lambda x: mm(x["stuck"])[1])
        rec["worst_free"] = [wf["z"], wf["dy"], *mm(wf["free"])]
        rec["worst_stuck"] = [ws["z"], ws["dy"], *mm(ws["stuck"])]
        out["A"].append(rec)
        print(f"  {n} {kt:8.0f} | {mm(wf['free'])[0]:.3f} / {mm(wf['free'])[1]:.3f} at {wf['z']:.1f} {wf['dy']:+.2f} | "
              f"{mm(ws['stuck'])[0]:.1e} / {mm(ws['stuck'])[1]:.3f} at {ws['z']:.1f} {ws['dy']:+.2f}")
print()

# ------------------------------------------------------------------ B. does the nose stick
print("## B. Friction the stuck nose needs (|lam| / F, the press grown from zero at contact), per robot: "
      "min | median | max over poses (pose of the max)")
out["B"] = {}
for n in fetch.ROBOTS:
    ratios = []
    for key in [k for k in KEYS if k[0] == n]:
        _, lam = press(key, 1e4, "stuck")
        lam = lam / (F_HI / 2)          # per newton of press
        ratios.append((math.hypot(lam[0], lam[1]), key, lam.tolist()))
    r = sorted(ratios)
    out["B"][n] = {"min": r[0][0], "median": r[len(r) // 2][0], "max": r[-1][0], "at": list(r[-1][1][1:]),
                   "per_pose": [{"z": k[1], "dy": k[2], "ratio": v, "lam_per_N": lm} for v, k, lm in ratios],
                   "stuck_at": {str(mu): sum(v <= mu for v, _, _ in ratios) for mu in (0.2, 0.3, 0.4, 0.6, 0.8)},
                   "poses": len(r)}
    print(f"  {n}: {r[0][0]:.3f} | {r[len(r) // 2][0]:.3f} | {r[-1][0]:.3f} (at {r[-1][1][1]:.1f} {r[-1][1][2]:+.2f}); "
          f"poses stuck at mu 0.2/0.3/0.4/0.6/0.8: " + "/".join(str(v) for v in out["B"][n]["stuck_at"].values())
          + f" of {len(r)}")
# check: the reaction does not depend on a common k_t
k0 = KEYS[0]
l1, l2 = press(k0, 3e3, "stuck")[1], press(k0, 1e5, "stuck")[1]
out["B"]["k_independence"] = float(np.max(np.abs(l1 - l2)))
print(f"check: sticking reaction at k_t 3e3 vs 1e5 differs by {out['B']['k_independence']:.1e} N (expect 0)")
print()

# ------------------------------------------------------------------ C. stacks
print("## C. Stack loss from the press window (points, against the same stack with no windup), worst pose: "
      "robot | k_t | free nose | stuck nose | friction-limited at mu 0.4")
V0 = {key: V(key) for key in KEYS}
out["V0"] = {f"{k[0]} {k[1]} {k[2]}": v for k, v in V0.items()}
out["C"] = []
for n in fetch.ROBOTS:
    ks = [k for k in KEYS if k[0] == n]
    for kt in KT:
        rec = {"robot": n, "kt": kt}
        for mode in ("free", "stuck", "slip"):
            losses = {}
            for key in ks:
                A, Bd = AB(key)
                losses[key] = V0[key] - V(key, WU.offsets(A, Bd, press(key, kt, mode)[0]))
            wk = max(losses, key=losses.get)
            rec[mode] = {"worst_loss": losses[wk], "at": [wk[1], wk[2]],
                         "per_pose": [{"z": k[1], "dy": k[2], "loss": v} for k, v in losses.items()]}
        out["C"].append(rec)
        print(f"  {n} {kt:8.0f} | {100 * rec['free']['worst_loss']:6.2f} at {rec['free']['at'][0]:.1f} "
              f"{rec['free']['at'][1]:+.2f} | {100 * rec['stuck']['worst_loss']:6.2f} at {rec['stuck']['at'][0]:.1f} "
              f"{rec['stuck']['at'][1]:+.2f} | {100 * rec['slip']['worst_loss']:6.2f} at {rec['slip']['at'][0]:.1f} "
              f"{rec['slip']['at'][1]:+.2f}")
print()

print("## C2. The k_t a spec must ask for: worst-pose loss (points) over a finer k_t grid, and the smallest grid k_t "
      "within 2 points")
out["C2"] = {}
for n in fetch.ROBOTS:
    ks = [k for k in KEYS if k[0] == n]
    out["C2"][n] = {}
    for mode in ("free", "slip"):
        row = []
        for kt in KSPEC:
            row.append(max(V0[key] - V(key, WU.offsets(*AB(key), press(key, kt, mode)[0])) for key in ks))
        ok = [kt for kt, l in zip(KSPEC, row) if l <= 0.02]
        need = min(ok) if ok else None
        out["C2"][n][mode] = {"kt": KSPEC, "worst_loss": row, "need": need}
        print(f"  {n} {mode:5s}: " + " ".join(f"{kt:.0e}:{100 * l:.2f}" for kt, l in zip(KSPEC, row))
              + (f" -> k_t >= {need:.2e}" if need else " -> none on the grid"))
print()

# ------------------------------------------------------------------ D. the mean windup as a pose bias
print("## D. Mean windup at 37.5 N (free nose) as a pose bias: worst offset along the wall after one calibration at "
      "milestone 30's pose (mm); a model with k_t misjudged by 25% leaves a quarter of it")
out["D"] = []
for n in fetch.ROBOTS:
    ref = (n,) + REF
    if ref not in KEYS:
        continue
    for kt in KT:
        def bias(key):
            tm = 0.5 * (TQ[key][0] + TQ[key][1])
            return PR.nose_bias(*POSE[key].rows[:2], WU.free_windup(tm, kt), L0)
        br = bias(ref)
        res = [(PR.residual(bias(k), br), k) for k in KEYS if k[0] == n]
        w = max(res, key=lambda x: abs(x[0]["y"][0]))
        wz = max(res, key=lambda x: abs(x[0]["z"][0]))
        out["D"].append({"robot": n, "kt": kt, "worst_y": w[0]["y"][0], "at_y": [w[1][1], w[1][2]],
                         "worst_z": wz[0]["z"][0], "at_z": [wz[1][1], wz[1][2]]})
        print(f"  {n} {kt:8.0f} | y {w[0]['y'][0] / MM:+.3f} at {w[1][1]:.1f} {w[1][2]:+.2f} | "
              f"z {wz[0]['z'][0] / MM:+.3f} at {wz[1][1]:.1f} {wz[1][2]:+.2f}")
print()

# ------------------------------------------------------------------ E. servo droop from the magazine
print("## E. Servo droop: an unmodelled full magazine (+0.295 kg) under Unitree's PD gains, free nose (mm), worst "
      "pose | the joints that carry most of it")
out["E"] = {}
for n in fetch.ROBOTS:
    r, names, _ = ROB[n]
    kp = Hm.gains(r)[6:]
    rows = []
    for key in KEYS:
        if key[0] != n or TQM[key] is None:
            continue
        dtau = 0.5 * ((TQM[key][0] + TQM[key][1]) - (TQ[key][0] + TQ[key][1]))
        dq = WU.free_windup(dtau, kp)
        A, Bd = AB(key)
        o = WU.offsets(A, Bd, dq)
        contrib = np.abs(A[1:3] * dq).sum(axis=0)
        top = [names[j] for j in np.argsort(contrib)[::-1][:3]]
        rows.append((mm(o)[0], key, o, top))
    w = max(rows, key=lambda x: x[0])
    out["E"][n] = {"worst_mm": w[0], "at": [w[1][1], w[1][2]], "y": w[2]["y"][0], "z": w[2]["z"][0], "top": w[3],
                   "best_mm": min(x[0] for x in rows), "poses": len(rows)}
    print(f"  {n}: {w[0]:.2f} mm at {w[1][1]:.1f} {w[1][2]:+.2f} (y {w[2]['y'][0] / MM:+.2f}, z {w[2]['z'][0] / MM:+.2f}); "
          f"least {out['E'][n]['best_mm']:.2f} mm; mostly {', '.join(w[3])}")
print()

# ------------------------------------------------------------------ F. hypotheses
print("## F. Hypotheses (registered in LOG.md before this run)")
b = out["B"]["g1"]
h124 = b["max"] <= MU_REG
print(f"H124 (the G1's nose sticks at mu 0.4): largest friction needed {b['max']:.3f} at {b['at']} -> "
      f"{'held' if h124 else 'refuted'}")
c = [x for x in out["C"] if x["robot"] == "g1" and x["kt"] == 1e4][0]
h125 = c["free"]["worst_loss"] > 0.02
print(f"H125 (free nose, k_t 1e4: > 2 points): {100 * c['free']['worst_loss']:.2f} -> {'held' if h125 else 'refuted'}")
h126 = c["stuck"]["worst_loss"] <= 0.01
print(f"H126 (stuck nose, k_t 1e4: <= 1 point): {100 * c['stuck']['worst_loss']:.2f} -> {'held' if h126 else 'refuted'}")
h127 = out["E"]["g1"]["worst_mm"] > 1.0
print(f"H127 (servo droop > 1 mm): {out['E']['g1']['worst_mm']:.2f} mm -> {'held' if h127 else 'refuted'}")
out["F"] = {"H124": h124, "H125": h125, "H126": h126, "H127": h127}

json.dump(out, open(os.path.join(HERE, "results.json"), "w"), indent=1)
print(f"\n(run time {time.time() - T0:.0f} s; python {platform.python_version()}, numpy {np.__version__}, "
      f"mujoco {mujoco.__version__})")
