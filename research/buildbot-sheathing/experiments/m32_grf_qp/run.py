"""Milestone 32: backlash along a wall when the feet push through real soles and a controller picks the split.

A. Milestone 31's poses (no lean) with each sole's contact points and friction cones (mu 0.5): the press
   range the cones can balance. Then each grid pose leaned into the wall (com_dx by secant) so the centre
   of pressure sits mid-sole at 37.5 N, and its press window.
B. Four ground-reaction models at each leaned pose and both press ends (25, 50 N): 'free' (milestone 31's
   least-norm 6-D wrench per foot), 'force' (min ||f||^2 in the cones), 'torque' (min leg torque^2) and
   'hold' (torque, plus every leg joint kept on one side by >= tau_f; the side per joint from the
   torque controller at the reference pose, both sides searched where it is ambiguous). Waist and arm
   torques checked equal across models. Held sets and sign flips.
C. Per model: the single-2x stack per pose at 12 bits, no backlash, 5 arcmin calibrated per pose, and 5 arcmin
   with one calibration at the reference pose (residual split into Jacobian and flip parts).
D. Sweeps: mu 0.3-0.8 and tau_f 0.05-0.5 (feasibility of 'hold', flips under 'force', worst residual).
E. Hypotheses H118-H120 (registered in LOG.md before this run).

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

print("# Milestone 32: the sign flips under a balance controller's ground reaction")

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



MU = 0.5
MUS = [0.3, 0.5, 0.8]
F_MID = 37.5
TT = (L0, 0, 0)
MODELS = ["free", "force", "torque", "hold", "hold-min"]
LIGHT = ("hip_roll", "hip_yaw", "ankle_roll")   # hold-min: the lightly loaded leg joints (added after the first run)


def contact(r, qpos, F, mu=MU):
    h, d = GQ.generalised_load(r, qpos, TOOL_KG, F, TT)
    pts = GQ.contact_points(r.model, d, r)
    return GQ.Contact(h, GQ.contact_jacobian(r.model, d, pts), mu), pts


ROB, POSE = {}, {}
# ------------------------------------------------------------------ A. press windows, lean
print("## A. Press the soles can balance (mu 0.5): milestone 31's pose (no lean) | leaned pose (com_dx) window")
print("robot z dy | no lean: max press (N) | com_dx (m) | leaned window (N) | IK residual (mm)")
out["A"] = []
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
            w0 = GQ.press_window(r, p0.qpos, TOOL_KG, TT, MU, 0.0)
            p, dx, cx = GQ.leaned_pose(r, d0, (X, z), TOOL_KG, F_MID, TT, dy=dy)
            w = GQ.press_window(r, p.qpos, TOOL_KG, TT, MU, F_MID) if p.ok else None
            rec = {"robot": n, "z": z, "dy": dy, "nolean": w0, "com_dx": dx, "window": w, "ok": bool(p.ok),
                   "residual": p.residual}
            out["A"].append(rec)
            print(f"  {n} {z:.1f} {dy:+.2f} | {w0[1] if w0 else float('nan'):6.1f} | {dx:+.3f} | "
                  + (f"{w[0]:5.1f}-{w[1]:5.1f}" if w else "none") + f" | {p.residual * 1e3:.3f}")
            if p.ok and w and w[0] <= F_HI / 2 and w[1] >= F_HI:
                POSE[(n, z, dy)] = p
print(f"poses balancing the whole 25-50 N range when leaned: {len(POSE)} of {len(out['A'])}")
print()


# ------------------------------------------------------------------ B. torques under each model
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


def torques(n, key, model, mu=MU, signs=None, tau_f=0.2):
    r, names, legs = ROB[n]
    if signs is None and model in ("hold", "hold-min"):
        signs = SIGNS[(n, model)]
    q = POSE[key].qpos
    if model == "free":
        return [B.static_torques(r, q, TOOL_KG, F, TT) for F in (F_HI / 2, F_HI)], {"feasible": True}
    out_t, infos = [], []
    for F in (F_HI / 2, F_HI):
        c, _ = contact(r, q, F, mu)
        if model == "hold-min":
            f, info = GQ.solve(c, "hold", legs, signs, tau_f, hold_idx=light(n))
        else:
            f, info = GQ.solve(c, model, legs, signs, tau_f)
        infos.append(info)
        if f is None:
            return None, {"feasible": False, "margin": info["margin"], "press": F}
        out_t.append(c.tau(f))
    return out_t, {"feasible": True, "qp_ok": all(i["qp_ok"] for i in infos),
                   "margin": min(i["margin"] for i in infos)}


def choose_signs(n, mu=MU, tau_f=0.2, model="hold"):
    """Leg-joint sides for 'hold': the torque controller's at the reference pose where it is held there,
    else the combination (both sides each) with the largest worst-case LP margin over the grid."""
    r, names, legs = ROB[n]
    if model == "hold-min":
        legs = light(n)
    ref = (n,) + REF
    (tlo, thi), _ = torques(n, ref, "torque", mu)
    base = np.sign(thi[legs])
    amb = [k for k, j in enumerate(legs) if not B.held(tlo[j:j + 1], thi[j:j + 1], tau_f)[0]]
    keys = [k for k in POSE if k[0] == n]
    cs = {(k, F): contact(r, POSE[k].qpos, F, mu)[0] for k in keys for F in (F_HI / 2, F_HI)}
    best = None
    for combo in range(2 ** len(amb)):
        s = base.copy()
        for b, k in enumerate(amb):
            s[k] = 1.0 if (combo >> b) & 1 else -1.0
        worst = min(GQ.margin_lp(c, legs, s)[0] or -1e9 for c in cs.values())
        if best is None or worst > best[0]:
            best = (worst, s)
    return best[1], [names[legs[k]] for k in amb], best[0]


SIGNS = {}
for n in fetch.ROBOTS:
    for mdl in ("hold", "hold-min"):
        s, amb, worst = choose_signs(n, model=mdl)
        SIGNS[(n, mdl)] = s
        _, names, legs = ROB[n]
        if mdl == "hold-min":
            legs = light(n)
        out.setdefault("signs", {})[f"{n}/{mdl}"] = {"signs": {names[j]: int(v) for j, v in zip(legs, s)},
                                                     "searched": amb, "worst_margin": worst}
        print(f"## B0. {n} {mdl}: sides " + ", ".join(f"{names[j].replace('_joint', '')} {'+' if v > 0 else '-'}"
                                                     for j, v in zip(legs, s))
              + f"; searched {len(amb)} ({', '.join(a.replace('_joint', '') for a in amb)}); worst LP margin {worst:.2f} N m")
print()

TAU = {}                                   # (model, key) -> (tlo, thi)
print("## B. Held sets per model (tau_f 0.2; moving joints held / loose ones listed)")
out["B"] = []
for key in POSE:
    n = key[0]
    r, names, legs = ROB[n]
    jp, jr = rows_at(r, POSE[key].qpos)
    rows = B.tool_rows(jp, jr, TT)
    moving = np.hypot(rows[1], rows[2]) > 1e-6
    POSE[key].rows = (jp, jr, moving)
    nl = [i for i in range(len(names)) if i not in legs]
    line, rec = [], {"robot": n, "z": key[1], "dy": key[2], "models": {}}
    for mdl in MODELS:
        t, info = torques(n, key, mdl)
        if t is None:
            rec["models"][mdl] = info
            line.append(f"{mdl}: infeasible (margin {info['margin']:.2f} at {info['press']:.0f} N)")
            continue
        TAU[(mdl, key)] = t
        if mdl != "free":
            dn = max(float(np.max(np.abs(t[i][nl] - TAU[('free', key)][i][nl]))) for i in (0, 1))
        else:
            dn = 0.0
        h = B.held(t[0], t[1], 0.2)
        loose = [names[k].replace("_joint", "") for k in np.flatnonzero(~h & moving)]
        rec["models"][mdl] = {**info, "held": int((h & moving).sum()), "loose": loose, "nonleg_diff": dn,
                              "tau_hi": t[1].tolist(), "tau_lo": t[0].tolist()}
        line.append(f"{mdl}: {int((h & moving).sum())} ({', '.join(loose) or '-'})")
    out["B"].append(rec)
    print(f"  {n} {key[1]:.1f} {key[2]:+.2f} | " + " | ".join(line))
nonleg = max(m["nonleg_diff"] for x in out["B"] for m in x["models"].values() if "nonleg_diff" in m)
out["nonleg_max_diff"] = nonleg
print(f"largest change of a waist or arm torque between models: {nonleg:.2e} N m")
print()

print("## B2. Joints held at every pose whose torque flips sign across the grid, per model")
out["flips"] = {}


def flips(n, mdl, tau_f=0.2, taus=None):
    keys = [k for k in POSE if k[0] == n]
    taus = taus or {k: TAU.get((mdl, k)) for k in keys}
    if any(taus[k] is None for k in keys):
        return None
    names = ROB[n][1]
    th = [taus[k][1] for k in keys]
    hm = [B.held(taus[k][0], taus[k][1], tau_f) for k in keys]
    mv = np.all([POSE[k].rows[2] for k in keys], axis=0)
    idx = PR.sign_flips(th, hm, mv)
    return {"always_held": int((np.all(hm, axis=0) & mv).sum()), "flips": [names[k] for k in idx],
            "range": {names[k]: [float(min(t[k] for t in th)), float(max(t[k] for t in th))] for k in idx}}


for n in fetch.ROBOTS:
    for mdl in MODELS:
        fl = flips(n, mdl)
        out["flips"][f"{n}/{mdl}"] = fl
        if fl is None:
            print(f"  {n} {mdl}: not every pose feasible")
            continue
        print(f"  {n} {mdl}: {fl['always_held']} held everywhere; flipping: "
              + (", ".join(f"{k.replace('_joint', '')} ({a:+.2f} to {b:+.2f})" for k, (a, b) in fl["range"].items())
                 or "none"))
print()


# ------------------------------------------------------------------ C. stacks
def err_at(key, t, bits, gap_am, tau_f=0.2):
    jp, jr, _ = POSE[key].rows
    loose = ~B.held(t[0], t[1], tau_f)
    return B.from_rows(jp, jr, B.joint_sigmas(T.quant_sigma(bits), gap_am * AM, loose), L0)


def bias_at(key, t, gap_am, tau_f=0.2):
    jp, jr, _ = POSE[key].rows
    delta = PR.held_bias(t[0], t[1], tau_f, gap_am * AM)
    return delta, PR.nose_bias(jp, jr, delta, L0)


def one_cal(key, t, tref, gap_am, tau_f=0.2, ref=None):
    n = key[0]
    ref = ref or (n,) + REF
    jp, jr, _ = POSE[key].rows
    dref, bref = bias_at(ref, tref, gap_am, tau_f)
    dp, bp = bias_at(key, t, gap_am, tau_f)
    return (PR.residual(bp, bref), PR.residual(PR.nose_bias(jp, jr, dref, L0), bref),
            PR.nose_bias(jp, jr, dp - dref, L0))


print(f"## C. Single-2x stack, 12 bits: no backlash | {GAP} arcmin per-pose cal (pts) | one cal (pts), "
      "residual y surface (mm) [Jacobian part, flip part]")
out["C"] = []
V0 = {}
for key in POSE:
    n = key[0]
    V0[key] = stack(err_at(key, TAU[("free", key)], 12, 0))
    cells = []
    for mdl in MODELS:
        t = TAU.get((mdl, key))
        tref = TAU.get((mdl, (n,) + REF))
        if t is None or tref is None:
            cells.append(f"{mdl} -")
            continue
        e5 = err_at(key, t, 12, GAP)
        vp = stack(e5)
        mu, jac, flip = one_cal(key, t, tref, GAP)
        vc = stack(PR.with_bias(e5, mu))
        out["C"].append({"robot": n, "z": key[1], "dy": key[2], "model": mdl, "v0": V0[key], "per_pose": vp,
                         "one_cal": vc, "mu": mu, "jac": jac, "flip": flip})
        cells.append(f"{mdl} {100 * (vp - V0[key]):+.2f} {100 * (vc - V0[key]):+.2f} {mu['y'][0] / MM:+.2f} "
                     f"[{jac['y'][0] / MM:+.2f}, {flip['y'][0] / MM:+.2f}]")
    print(f"  {n} {key[1]:.1f} {key[2]:+.2f} | {V0[key]:.4f} | " + " | ".join(cells))
print()
print("## C2. Worst over the grid, per robot and model: per-pose loss (pts) | one-cal loss (pts) | |residual y| (mm)")
out["C2"] = {}
for n in fetch.ROBOTS:
    for mdl in MODELS:
        rs = [x for x in out["C"] if x["robot"] == n and x["model"] == mdl]
        if not rs:
            continue
        a = max(rs, key=lambda x: x["v0"] - x["per_pose"])
        b = max(rs, key=lambda x: x["v0"] - x["one_cal"])
        c = max(rs, key=lambda x: abs(x["mu"]["y"][0]))
        out["C2"][f"{n}/{mdl}"] = {"per_pose": [a["z"], a["dy"], a["v0"] - a["per_pose"]],
                                   "one_cal": [b["z"], b["dy"], b["v0"] - b["one_cal"]],
                                   "mu_y": [c["z"], c["dy"], c["mu"]["y"][0]], "n": len(rs)}
        print(f"  {n} {mdl:6s} ({len(rs)} poses) | {100 * (a['v0'] - a['per_pose']):.2f} at {a['z']:.1f} {a['dy']:+.2f} | "
              f"{100 * (b['v0'] - b['one_cal']):.2f} at {b['z']:.1f} {b['dy']:+.2f} | {c['mu']['y'][0] / MM:+.3f} at "
              f"{c['z']:.1f} {c['dy']:+.2f}")
print()

# ------------------------------------------------------------------ D. sweeps (G1)
print("## D. G1 sweeps: mu and tau_f | hold feasible | hold-min feasible | flips under 'force' | worst |residual y| under hold-min (mm)")
out["D"] = []
g1 = [k for k in POSE if k[0] == "g1"]
for mu_ in MUS:
    for tf in TAU_F:
        if mu_ != MU and tf != 0.2:
            continue
        s, _, _ = choose_signs("g1", mu_, tf)
        ht = {k: torques("g1", k, "hold", mu_, s, tf)[0] for k in g1}
        sm, _, _ = choose_signs("g1", mu_, tf, "hold-min")
        hm = {k: torques("g1", k, "hold-min", mu_, sm, tf)[0] for k in g1}
        ft = {k: torques("g1", k, "force", mu_)[0] for k in g1}
        nfe = sum(v is not None for v in ht.values())
        ff = flips("g1", "force", tf, taus=ft) if all(v is not None for v in ft.values()) else None
        ref = ("g1",) + REF
        nmf = sum(v is not None for v in hm.values())
        worst = None
        if hm.get(ref) is not None:
            worst = max(abs(one_cal(k, hm[k], hm[ref], GAP, tf)[0]["y"][0]) for k in g1 if hm[k] is not None)
        out["D"].append({"mu": mu_, "tau_f": tf, "hold_feasible": nfe, "holdmin_feasible": nmf, "poses": len(g1),
                         "force_flips": None if ff is None else ff["flips"], "holdmin_worst_mu_y": worst})
        print(f"  mu {mu_:.1f} tau_f {tf:.2f} | {nfe}/{len(g1)} | {nmf}/{len(g1)} | "
              f"{'-' if ff is None else (', '.join(x.replace('_joint', '') for x in ff['flips']) or 'none')} | "
              f"{'-' if worst is None else f'{worst / MM:.3f}'}")
print()

# ------------------------------------------------------------------ F. the calibration pose (not registered)
print("## F. Which single calibration pose leaves least (G1, 5 arcmin, not registered): model | worst |residual y| "
      "(mm) calibrated at 1.0 +0.00 | best pose and its worst | stack at the worst pose for that calibration (pts)")
out["F"] = []
for mdl in ("free", "torque", "hold-min"):
    ks = [k for k in POSE if k[0] == "g1" and TAU.get((mdl, k)) is not None]
    if len(ks) < len([k for k in POSE if k[0] == "g1"]):
        continue

    def worst(ref):
        return max(abs(one_cal(k, TAU[(mdl, k)], TAU[(mdl, ref)], GAP, ref=ref)[0]["y"][0]) for k in ks)
    w_ref = worst(("g1",) + REF)
    best = min(ks, key=worst)
    loss = []
    for k in ks:
        e5 = err_at(k, TAU[(mdl, k)], 12, GAP)
        mu = one_cal(k, TAU[(mdl, k)], TAU[(mdl, best)], GAP, ref=best)[0]
        loss.append((V0[k] - stack(PR.with_bias(e5, mu)), k))
    lw = max(loss)
    out["F"].append({"model": mdl, "worst_at_ref": w_ref, "best_ref": list(best[1:]), "worst_at_best": worst(best),
                     "worst_loss_at_best": lw[0], "worst_loss_pose": list(lw[1][1:])})
    print(f"  {mdl:8s} | {w_ref / MM:.3f} | {best[1]:.1f} {best[2]:+.2f}: {worst(best) / MM:.3f} | "
          f"{100 * lw[0]:.2f} at {lw[1][1]:.1f} {lw[1][2]:+.2f}")
print()

# ------------------------------------------------------------------ E. hypotheses
print("## E. Hypotheses (registered in LOG.md before this run)")
ff = out["flips"]["g1/force"]
hy = [x for x in (ff["flips"] if ff else []) if "hip_yaw" in x]
h118 = len(hy) >= 1
print(f"H118 (a G1 hip yaw still flips under 'force', mu 0.5): {hy or 'none'} -> {'held' if h118 else 'refuted'}")
infe = [(x["z"], x["dy"]) for x in out["B"] if x["robot"] == "g1" and not x["models"]["hold"].get("feasible", True)]
h119 = not infe and len(g1) == len([x for x in out["A"] if x["robot"] == "g1"])
print(f"H119 ('hold' feasible at every G1 grid pose, both press ends): infeasible at {infe or 'none'}; "
      f"{len(g1)} of {len([x for x in out['A'] if x['robot'] == 'g1'])} grid poses balance 25-50 N when leaned "
      f"-> {'held' if h119 else 'refuted'}")
w = out["C2"].get("g1/hold")
h120 = w is not None and abs(w["mu_y"][2]) > 1 * MM
print(f"H120 (under 'hold', one calibration still leaves > 1 mm at the worst G1 pose): "
      + (f"{w['mu_y'][2] / MM:+.3f} mm at {w['mu_y'][0]:.1f} {w['mu_y'][1]:+.2f}" if w else "no feasible poses")
      + " -> " + (("held" if h120 else "refuted") if w else "not testable (no pose where 'hold' is feasible)"))
wm = out["C2"].get("g1/hold-min")
if wm:
    print(f"(not registered) under 'hold-min', worst one-cal residual {wm['mu_y'][2] / MM:+.3f} mm at "
          f"{wm['mu_y'][0]:.1f} {wm['mu_y'][1]:+.2f}; worst one-cal loss {100 * wm['one_cal'][2]:.2f} pts")
out["E"] = {"H118": h118, "H119": h119, "H119_infeasible": infe, "H120": h120,
            "H120_testable": w is not None}

json.dump(out, open(os.path.join(HERE, "results.json"), "w"), indent=1)
print(f"\n(run time {time.time() - T0:.0f} s; python {platform.python_version()}, numpy {np.__version__}, "
      f"mujoco {mujoco.__version__})")
