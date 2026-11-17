"""Milestone 15: do the framing joints explain why milestone 14's model understated Weiss's walls?

    python experiments/m15_frame_joints/run.py > experiments/m15_frame_joints/results.txt

A rigid-body limit analysis (``frame_lp.Frame``, a linear programme) in which the studs, the plates and
the sheet are separate bodies and the stud-to-plate joints have finite strength. Reads milestone 14's
inputs (../m11_measured/profiles.json, ../m6b_bowed_edge/results.json, ../m14_escaped/results.json);
writes results.json beside this file. H65-H69 were registered in LOG.md before this script was run.
Needs numpy and scipy; a few minutes on one CPU.
"""
import json
import os
import platform
import sys
import time

import numpy as np
import scipy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from buildbot_sheathing import ceiling as Q  # noqa: E402
from buildbot_sheathing import frame_lp as L  # noqa: E402
from buildbot_sheathing import measured as M  # noqa: E402
from buildbot_sheathing import racking as R  # noqa: E402
from buildbot_sheathing import straighten as S  # noqa: E402
from buildbot_sheathing.asbuilt import STUD_LEN, U_JOINT  # noqa: E402
from buildbot_sheathing.budget import EDGE, HEIGHT, IN, SPACING  # noqa: E402

T0 = time.time()
MM = 1e-3
N = 20000
D = json.load(open(os.path.join(HERE, "..", "m11_measured", "profiles.json")))
m6b = json.load(open(os.path.join(HERE, "..", "m6b_bowed_edge", "results.json")))
M14 = json.load(open(os.path.join(HERE, "..", "m14_escaped", "results.json")))
ROCK = np.radians(np.array(m6b["F_draws"]["drake_deg"]))
MEAS = M.model_profiles(D["members"], "smooth", STUD_LEN)
MID = S.Straightener("mid", U_JOINT, "pinned", 0.5e-3)
out = {"versions": {"python": platform.python_version(), "numpy": np.__version__, "scipy": scipy.__version__},
       "trials": N, "seed": 7}

XZ, FR = R.layout()
FRAME = L.Frame(XZ, FR)
W0 = R.capacity(np.ones((1, XZ.shape[0]), bool), XZ, FR)[0][0]
Z = XZ[:, 1]
WEISS = ~(Z < 12 * IN - 1e-9)
NDS = L.nds_rho(0.50, 0.50)
RHO = NDS["rho"]
BASE = dict(rho=RHO, omega=0.0)          # the registered joint model

print("# Milestone 15: framing joints of finite strength (buildbot-sheathing)")
print("rigid-body limit analysis (LP, HiGHS): bottom plate fixed, top plate, 4 studs and the sheet as bodies; "
      "sheathing nails rigid-plastic (capacity F, 64-gon); stud-to-plate joints of lateral capacity rho F, "
      "bearing in compression, opening against omega F; hold-downs on the end studs. 4x8 sheet, 6 in edge / "
      "12 in field (62 nails). Capacities in units of F per unit top displacement unless said.\n")

# ------------------------------------------------------------------ A. the NDS ratio
print("## A. Joint strength from the NDS yield-limit equations (R_d = 2.2, single shear)")
A = {}
for lab, g in (("DF-L framing (G 0.50)", 0.50), ("SPF framing (G 0.42)", 0.42)):
    r = L.nds_rho(g, 0.50)
    A[lab] = r
    print(f"{lab}: 8d common through 15/32 in OSB, Z = {r['z8']:.1f} lb (mode {r['mode8']}); 16d common through "
          f"1.5 in plate, Z = {r['z16']:.1f} lb (mode {r['mode16']}); 2 end nails x C_eg 0.67 = {r['joint']:.1f} lb; "
          f"rho = {r['rho']:.3f}")
print(f"registered model: rho = {RHO:.3f} (DF-L), omega = 0 (NDS allows no end-grain withdrawal)\n")
out["A"] = A

# ------------------------------------------------------------------ B. H65: reproduces milestone 14
print("## B. H65: with rigid joints the LP reproduces milestone 14")
c_rigid = FRAME.capacity()
ecc = L.Frame(XZ, FR, studs=np.array([EDGE, SPACING, 2 * SPACING, R.WIDTH - EDGE]))
c_ecc = ecc.capacity()
print(f"intact sheet: LP {c_rigid:.4f}, milestone 14 work / H {W0 / HEIGHT:.4f} (ratio {c_rigid / (W0 / HEIGHT):.4f}); "
      f"with the joint studs under the joint-edge nails (no 3/8 in eccentricity) {c_ecc / (W0 / HEIGHT):.4f}")
r3 = Q.clean(framing="2x", policy="three", rock_draw=ROCK, profiles=MEAS, warp="straight", trials=N, seed=7,
             hits=True)
H3 = r3["hits"]
pats = np.unique(H3, axis=0)
rng = np.random.default_rng(15)
pick = pats[rng.choice(len(pats), size=min(200, len(pats)), replace=False)]
pick = np.vstack([pick, WEISS[None]])
lp = np.array([FRAME.capacity(p) for p in pick]) / c_rigid
m14 = R.relative(pick, XZ, FR)
dev = np.abs(lp / m14 - 1)
h65 = bool(dev.max() <= 0.005)
print(f"{len(pick)} patterns (200 distinct three-read miss patterns and the Weiss pattern): ratio LP / milestone 14 "
      f"max |dev| {dev.max():.4%}, mean {dev.mean():.4%}; Weiss {lp[-1]:.4f} against {m14[-1]:.4f}")
print(f"H65 (within 0.5%): {'held' if h65 else 'refuted'}\n")
out["B"] = {"lp": c_rigid, "m14": W0 / HEIGHT, "eccentric_free": c_ecc / (W0 / HEIGHT), "max_dev": float(dev.max()),
            "weiss_lp": float(lp[-1]), "weiss_m14": float(m14[-1])}

# ------------------------------------------------------------------ C. H66: intact sheet
print("## C. H66: the intact sheet with finite joints (relative to rigid joints at the same spacing)")
C = {}
print("edge in   rigid      NDS joints   change    SDPWS ratio  model ratio (NDS)")
TABLE = {6: 280, 4: 430, 3: 550, 2: 730}
base6 = None
for e in (6, 4, 3, 2):
    xz, fr = R.layout_spacing(e)
    f = L.Frame(xz, fr)
    cr, cn = f.capacity(), f.capacity(**BASE)
    base6 = cn if e == 6 else base6
    C[e] = {"rigid": cr, "nds": cn, "change": cn / cr - 1, "table": TABLE[e] / 280, "model_ratio": cn / base6}
    print(f"{e:7d}   {cr:7.3f}    {cn:9.3f}   {cn / cr - 1:+7.2%}   {TABLE[e] / 280:11.3f}  {cn / base6:10.3f}")
h66 = all(abs(C[e]["change"]) < 0.02 for e in C)
h60_still = all(abs(C[e]["model_ratio"] / C[e]["table"] - 1) <= 0.10 for e in (4, 3, 2))
print(f"H66 (each change under 2%): {'held' if h66 else 'refuted'}; H60's spacing check at NDS joints "
      f"(within 10%): {'still holds' if h60_still else 'fails'}")
print("intact 6 in sheet against omega (rho = NDS), relative to rigid joints: " + ", ".join(
    f"{om:g}:{FRAME.capacity(rho=RHO, omega=om) / c_rigid:.4f}" for om in (0, 0.25, 0.5, 1, 2, 4)))
cap0, mot = FRAME.capacity(return_motion=True, **BASE)
lift = [float(mot[1 + s, 1] + mot[1 + s, 2] * L.STUDS[s]) for s in range(4)]
print(f"mechanism at NDS joints: stud bottoms lift by {', '.join(f'{v:+.4f}' for v in lift)} (per unit top slide); "
      f"top plate rotation {mot[0, 2]:+.5f} rad\n")
out["C"] = {"spacing": C, "h60_still": h60_still, "stud_lift": lift}

# ------------------------------------------------------------------ D. H67: Weiss
print("## D. H67: every nail below 12 in omitted (Weiss 2017)")
RHOS = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.55, 3.0, 4.0, 8.0]
OMS = [0.0, 0.5, 1.0, 2.0]
grid = {}
print("rho     " + "  ".join(f"omega {om:<4g}" for om in OMS) + "   (loss against the intact sheet with the same joints)")
for rr in RHOS:
    row = []
    for om in OMS:
        ci = FRAME.capacity(rho=rr, omega=om)
        cw = FRAME.capacity(WEISS, rho=rr, omega=om)
        row.append(1 - cw / ci)
    grid[rr] = row
    print(f"{rr:5.2f}   " + "  ".join(f"{v:10.1%}" for v in row))
ci = FRAME.capacity(**BASE)
cw, motw = FRAME.capacity(WEISS, return_motion=True, **BASE)
loss_nds = 1 - cw / ci
h67 = loss_nds >= 0.40


def threshold(target, om=0.0):
    lo, hi = 0.05, 8.0
    for _ in range(40):
        mid = 0.5 * (lo + hi)
        if 1 - FRAME.capacity(WEISS, rho=mid, omega=om) / FRAME.capacity(rho=mid, omega=om) >= target:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


t40, t50 = threshold(0.40), threshold(0.50)
slide = [float(motw[1 + s, 0]) for s in range(4)]
print(f"at NDS joints: loss {loss_nds:.1%}; studs' bottom slide {', '.join(f'{v:+.3f}' for v in slide)} per unit top slide")
print(f"rho for a 40% loss: {t40:.3f} ({t40 / RHO:.2f} of NDS); for 50%: {t50:.3f} ({t50 / RHO:.2f} of NDS) (omega 0)")
nh_i = FRAME.capacity(rho=RHO, omega=0.0, holddown=False)
nh_w = FRAME.capacity(WEISS, rho=RHO, omega=0.0, holddown=False)
nh_i1 = FRAME.capacity(rho=RHO, omega=1.0, holddown=False)
nh_w1 = FRAME.capacity(WEISS, rho=RHO, omega=1.0, holddown=False)
print(f"no hold-downs (not scored): intact {nh_i / ci:.3f} of the held-down sheet, Weiss loss {1 - nh_w / max(nh_i, 1e-12):.1%} "
      f"(omega 0); omega 1: intact {nh_i1 / ci:.3f}, Weiss loss {1 - nh_w1 / nh_i1:.1%}")
print(f"H67 (loss at least 40% at NDS joints): {'held' if h67 else 'refuted'}\n")
out["D"] = {"grid": {str(k): v for k, v in grid.items()}, "omegas": OMS, "loss_nds": loss_nds, "rho_40": t40,
            "rho_50": t50, "slide": slide, "noholddown": {"intact": nh_i / ci, "weiss_loss": 1 - nh_w / max(nh_i, 1e-12),
                                                          "intact_w1": nh_i1 / ci, "weiss_loss_w1": 1 - nh_w1 / nh_i1}}

# ------------------------------------------------------------------ E. single nails
print("## E. One nail missed alone (NDS joints, relative to the intact sheet with the same joints)")
single = np.ones((62, 62), bool)
np.fill_diagonal(single, False)
l_nds = 1 - np.array([FRAME.capacity(m, **BASE) for m in single]) / ci
l_rig = np.array(M14["layout"]["single_loss"])
groups = {"joint edges": slice(0, 34), "field studs": slice(34, 48), "bottom plate": slice(48, 55),
          "top plate": slice(55, 62)}
E = {}
for g, s in groups.items():
    E[g] = {"nds_mean": float(l_nds[s].mean()), "nds_max": float(l_nds[s].max()), "m14_mean": float(l_rig[s].mean())}
    print(f"{g:13s}: mean {l_nds[s].mean():.2%} (max {l_nds[s].max():.2%}) against milestone 14's {l_rig[s].mean():.2%}")
print()
out["E"] = {"groups": E, "single_loss": l_nds.tolist()}

# ------------------------------------------------------------------ F. H68: escaped misses
print("## F. H68: every miss escapes, NDS joints (20,000 sheets, seed 7, measured studs, ledger)")
rf = Q.clean(framing="2x", policy="local", straighten=MID, slide=0.5 * MM, shim=0.5 * MM, rock_draw=ROCK,
             profiles=MEAS, warp="straight", trials=N, seed=7, hits=True)
F_ = {}
CAP = {}
for lab, hits, key in (("single 2x, three reads", H3, "single 2x, three reads"),
                       ("single 2x, full stack", rf["hits"], "single 2x, full stack")):
    cap = FRAME.relative(hits, ref=ci, **BASE)
    CAP[lab] = cap
    m = M14["D"][key]
    F_[lab] = {"mean_loss": float(1 - cap.mean()), "p99_loss": float(1 - np.percentile(cap, 1)),
               "m14_mean_loss": 1 - m["mean_cap"], "m14_p99_loss": 1 - m["p1_cap"],
               "distinct": int(len(np.unique(hits, axis=0)))}
    print(f"{lab:23s}: mean loss {1 - cap.mean():.2%} (m14 {1 - m['mean_cap']:.2%}), p99 loss "
          f"{1 - np.percentile(cap, 1):.2%} (m14 {1 - m['p1_cap']:.2%}); {F_[lab]['distinct']} distinct patterns")
d = F_["single 2x, three reads"]
h68 = abs(d["mean_loss"] - d["m14_mean_loss"]) <= 0.01 and abs(d["p99_loss"] - d["m14_p99_loss"]) <= 0.01
print(f"H68 (three reads within 1 point of milestone 14 on both): {'held' if h68 else 'refuted'}\n")
out["F"] = F_

# ------------------------------------------------------------------ G. H69: 4 in joint edges
print("## G. H69: joint edges at 4 in (25 a side), every miss escapes, NDS joints")
zj4 = np.linspace(EDGE, HEIGHT - EDGE, 25)
xz4, fr4 = R.layout(z_joint=zj4)
F4 = L.Frame(xz4, fr4)
r4 = Q.clean(framing="2x", policy="three", rock_draw=ROCK, profiles=MEAS, warp="straight", trials=N, seed=7,
             hits=True, u_joint=zj4 / HEIGHT)
cap4 = F4.relative(r4["hits"], ref=ci, **BASE)
intact4 = F4.capacity(**BASE) / ci
p_ok = float((cap4 >= 1.0 - 1e-9).mean())
h69 = p_ok >= 0.99
print(f"intact 4 in-joint sheet {intact4:.3f} of the intact 6 in sheet (milestone 14: {M14['E']['intact']:.3f}); with misses "
      f"mean {cap4.mean():.4f}, p1 {np.percentile(cap4, 1):.4f}, min {cap4.min():.4f}")
print(f"H69 (>= the intact 6 in sheet in 99% of sheets): P = {p_ok:.4f}: {'held' if h69 else 'refuted'}\n")
out["G"] = {"intact": intact4, "mean": float(cap4.mean()), "p1": float(np.percentile(cap4, 1)),
            "min": float(cap4.min()), "p_ok": p_ok}

# ------------------------------------------------------------------ H. post hoc: a top plate that only slides
print("## H. Post hoc, not registered: the top plate only slides (a continuous double top plate over a wall line)")
print("Section C's intact-sheet loss comes from a lone sheet's top plate lifting and tilting while an interior stud "
      "separates (omega 0). Here the top plate is held to a pure slide; everything else as registered.")
TS = dict(BASE, top_slide_only=True)
cit = FRAME.capacity(**TS)
Hh = {"intact": cit / c_rigid}
sp = {}
for e in (6, 4, 3, 2):
    xz, fr = R.layout_spacing(e)
    f = L.Frame(xz, fr)
    sp[e] = f.capacity(**TS) / f.capacity() - 1
print("intact change against rigid joints at 6, 4, 3, 2 in: " + ", ".join(f"{sp[e]:+.2%}" for e in sp))
lw = 1 - FRAME.capacity(WEISS, **TS) / cit
t40s = t50s = None
lo, hi = 0.05, 8.0
for target in (0.40, 0.50):
    lo, hi = 0.05, 8.0
    for _ in range(40):
        mid = 0.5 * (lo + hi)
        ok = 1 - FRAME.capacity(WEISS, rho=mid, top_slide_only=True) / FRAME.capacity(rho=mid, top_slide_only=True)
        lo, hi = (mid, hi) if ok >= target else (lo, mid)
    if target == 0.40:
        t40s = 0.5 * (lo + hi)
    else:
        t50s = 0.5 * (lo + hi)
print(f"Weiss loss at NDS joints {lw:.1%}; rho for 40%: {t40s:.3f} ({t40s / RHO:.2f} of NDS), 50%: {t50s:.3f} "
      f"({t50s / RHO:.2f} of NDS)")
for lab, hits in (("single 2x, three reads", H3), ("single 2x, full stack", rf["hits"])):
    cap = FRAME.relative(hits, ref=cit, **TS)
    Hh[lab] = {"mean_loss": float(1 - cap.mean()), "p99_loss": float(1 - np.percentile(cap, 1))}
    print(f"{lab:23s}: mean loss {1 - cap.mean():.2%}, p99 loss {1 - np.percentile(cap, 1):.2%}")
cap4s = F4.relative(r4["hits"], ref=cit, **TS)
Hh["four"] = {"intact": F4.capacity(**TS) / cit, "p_ok": float((cap4s >= 1.0 - 1e-9).mean()),
              "p1": float(np.percentile(cap4s, 1))}
print(f"4 in joint edges: intact {Hh['four']['intact']:.3f}, P(>= intact 6 in) {Hh['four']['p_ok']:.4f}, "
      f"p1 {Hh['four']['p1']:.4f}\n")
Hh.update({"spacing_change": {str(k): v for k, v in sp.items()}, "weiss_loss": lw, "rho_40": t40s, "rho_50": t50s})
out["H"] = Hh

QS = np.linspace(0, 100, 201)
out["cap_quantiles"] = {"q": QS.tolist(), **{lab: np.percentile(c, QS).tolist() for lab, c in CAP.items()},
                        "single 2x, three reads, 4 in joint edges": np.percentile(cap4, QS).tolist()}
out["hypotheses"] = {"H65": h65, "H66": h66, "H67": h67, "H68": h68, "H69": h69}
out["seconds"] = round(time.time() - T0, 1)
json.dump(out, open(os.path.join(HERE, "results.json"), "w"), indent=1)
print(f"{out['seconds']} s")
