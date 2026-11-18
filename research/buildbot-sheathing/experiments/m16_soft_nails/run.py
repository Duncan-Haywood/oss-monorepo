"""Milestone 16: do softening nails explain why the model understated Weiss's walls?

    python experiments/m16_soft_nails/run.py > experiments/m16_soft_nails/results.txt

Reads ../m11_measured/profiles.json (the scanned studs), ../m6b_bowed_edge/results.json (the
smooth-bow seats) and ../m14_escaped/results.json (to check the reproduced cells); writes
results.json beside this file. H70-H74 were registered in LOG.md before this script was run.
A few minutes on one CPU.

Backbone: 8d common nails through 7/16 in OSB into SPF, Shameli Derakshan, Zhou and Ni (2019),
Table 2 (six replicates a group). Fp: mean of the three monotonic groups (0.95, 1.063, 0.904 kN).
K at 0.4 Fp: mean of the three cyclic groups (0.514, 0.401, 0.574 kN/mm; the paper calls the
monotonic K values unreliable). du (0.8 Fp after the peak): mean of the monotonic groups (28.3, 31.2,
26.7 mm) and of the cyclic groups (18.9, 21.4, 21.4 mm). The slip at peak dp is not tabulated: swept.
"""
import json
import os
import platform
import sys
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from buildbot_sheathing import ceiling as Q  # noqa: E402
from buildbot_sheathing import measured as M  # noqa: E402
from buildbot_sheathing import racking as R  # noqa: E402
from buildbot_sheathing import softnail as S  # noqa: E402
from buildbot_sheathing.asbuilt import STUD_LEN  # noqa: E402
from buildbot_sheathing.budget import EDGE, HEIGHT, IN  # noqa: E402

T0 = time.time()
MM = 1e-3
KN = 1e3
N = 20000
WALLS = 100000
D = json.load(open(os.path.join(HERE, "..", "m11_measured", "profiles.json")))
m6b = json.load(open(os.path.join(HERE, "..", "m6b_bowed_edge", "results.json")))
M14 = json.load(open(os.path.join(HERE, "..", "m14_escaped", "results.json")))
ROCK = np.radians(np.array(m6b["F_draws"]["drake_deg"]))
MEAS = M.model_profiles(D["members"], "smooth", STUD_LEN)
out = {"versions": {"python": platform.python_version(), "numpy": np.__version__}, "trials": N, "seed": 7}

FP = np.mean([0.95, 1.063, 0.904]) * KN
K40 = np.mean([0.514, 0.401, 0.574]) * KN / MM
DU = {"monotonic": np.mean([28.3, 31.2, 26.7]) * MM, "cyclic": np.mean([18.9, 21.4, 21.4]) * MM}
DPS = [6 * MM, 9 * MM, 12 * MM, 15 * MM]
BASE = S.Backbone.from_tests(FP, 12 * MM, K40, DU["monotonic"])
out["backbone"] = {"Fp_N": FP, "K40_N_per_m": K40, "du_m": DU, "dp_sweep_m": DPS,
                   "base": {"dp": BASE.dp, "n": BASE.n, "du": BASE.du, "k0_N_per_m": BASE.k0()}}

XZ, FR = R.layout()
ALL = np.ones((1, XZ.shape[0]), bool)
Z = XZ[:, 1]
WEISS = Z >= 12 * IN - 1e-9            # keep: every nail at or above 12 in (milestone 14's "z < 12 in" omitted)
WEISS_LE = Z > 12 * IN + 1e-9


def push(mask, bb, **kw):
    return S.pushover(np.atleast_2d(mask), XZ, FR, bb, **kw)


print("# Milestone 16: softening nails, pushed over (buildbot-sheathing)")
print("milestone 14's kinematics (pinned framing, rigid sheet, full anchorage); each nail a spring along its slip, "
      "rising to Fp at dp, 0.8 Fp at du, zero at dp + 5 (du - dp). Pushover to 150 mm in 0.25 mm steps.")
print(f"backbone (Shameli Derakshan et al. 2019, 8d common, 7/16 in OSB, SPF): Fp {FP / KN:.3f} kN, "
      f"K at 0.4 Fp {K40 * MM / KN:.3f} kN/mm, du {DU['monotonic'] / MM:.1f} mm monotonic, "
      f"{DU['cyclic'] / MM:.1f} mm cyclic; base dp 12 mm -> n = {BASE.n:.2f}, initial stiffness "
      f"{BASE.k0() * MM / KN:.3f} kN/mm\n")

# ------------------------------------------------------------------ A. H70: reduction to milestone 14
print("## A. Elastic-perfectly-plastic nails yielding at 0.01 mm against milestone 14's rigid-plastic capacity")
EPP = S.Backbone.elastic_plastic(1.0, 0.01 * MM)
r3 = Q.clean(framing="2x", policy="three", rock_draw=ROCK, profiles=MEAS, warp="straight", trials=N, seed=7,
             hits=True)
print(f"three-read cell reproduced: clean {r3['clean']:.4f}, missed {r3['missed']:.3f} "
      f"(milestone 14: {M14['D']['single 2x, three reads']['clean']:.4f}, "
      f"{M14['D']['single 2x, three reads']['missed']:.3f})")
pats = np.unique(r3["hits"], axis=0)
pats = pats[~pats.all(axis=1)]
rng = np.random.default_rng(16)
sel = pats[rng.choice(len(pats), 200, replace=False)]
chk = np.vstack([ALL, WEISS[None], sel])
w_rp = R.capacity(chk, XZ, FR)[0] / HEIGHT
e = push(chk, EPP, step=1 * MM)
err = np.abs(e["peak"] / w_rp - 1)
h70 = bool(err.max() <= 0.005)
print(f"intact: {e['peak'][0]:.4f} against {w_rp[0]:.4f} F (per unit F); Weiss: {e['peak'][1]:.4f} against "
      f"{w_rp[1]:.4f}; 200 patterns: max |error| {err[2:].max():.3%}, mean {err[2:].mean():.3%}")
print(f"H70 (within 0.5% for all 202): max {err.max():.3%}: {'held' if h70 else 'refuted'}\n")
out["A"] = {"intact": [float(e["peak"][0]), float(w_rp[0])], "weiss": [float(e["peak"][1]), float(w_rp[1])],
            "max_err": float(err.max()), "mean_err": float(err[2:].mean())}

# ------------------------------------------------------------------ B. H71: spacing table
print("## B. Intact sheet against edge spacing (field 12 in), base backbone, vs SDPWS Table 4.3A ratios")
TABLE = {6: 280, 4: 430, 3: 550, 2: 730}
B = {}
P6 = None
print("edge in   nails   peak kN   drift at peak mm   ratio   table   ratio/table   rigid-plastic ratio (m14)")
for ed, v in TABLE.items():
    xz, fr = R.layout_spacing(ed)
    o = S.pushover(np.ones((1, xz.shape[0]), bool), xz, fr, BASE)
    pk = float(o["peak"][0])
    if ed == 6:
        P6 = pk
    rr = pk / P6
    B[ed] = {"nails": int(xz.shape[0]), "peak_N": pk, "drift_mm": float(o["drift_at_peak"][0] / MM),
             "ratio": rr, "table": v / 280, "vs_table": rr / (v / 280), "m14": M14["A"][str(ed)]["model"]}
    print(f"{ed:7d}   {xz.shape[0]:5d}   {pk / KN:7.2f}   {o['drift_at_peak'][0] / MM:16.1f}   {rr:5.3f}   "
          f"{v / 280:5.3f}   {rr / (v / 280):11.3f}   {B[ed]['m14']:.3f}")
h71 = all(abs(B[ed]["vs_table"] - 1) <= 0.10 for ed in (4, 3, 2))
per_m = P6 / R.WIDTH
print(f"absolute, 6 in: {P6 / KN:.2f} kN a 4 ft sheet = {per_m / KN:.2f} kN/m = {per_m / 14.594:.0f} plf at the tested "
      f"Fp, against SDPWS's 280 plf allowable (560 plf nominal) for the heavier 15/32 in Structural I panel: "
      f"{per_m / 14.594 / 560:.2f} of nominal (not a like-for-like check)")
print(f"H71 (4, 3 and 2 in within 10% of the table's ratios): {'held' if h71 else 'refuted'}\n")
out["B"] = {str(k): v for k, v in B.items()}
out["B"]["per_m_N"] = per_m

# ------------------------------------------------------------------ C. H72: Weiss across the sweep
print("## C. Every nail below 12 in omitted (Weiss 2017), across the backbone sweep")
print("du        dp mm   n      intact kN  drift mm   Weiss kN  drift mm   loss    (z <= 12 in)   "
      "nails past dp at peak (intact | Weiss)   unloaded before peak (intact | Weiss)")
C = {}
losses = []
for dk, du in DU.items():
    for dp in DPS:
        bb = S.Backbone.from_tests(FP, dp, K40, du)
        o = push(np.vstack([ALL, WEISS[None], WEISS_LE[None]]), bb)
        pk = o["peak"]
        loss = 1 - pk[1] / pk[0]
        loss_le = 1 - pk[2] / pk[0]
        losses.append(loss)
        C[f"{dk}|{dp / MM:g}"] = {"n": bb.n, "intact_N": float(pk[0]), "weiss_N": float(pk[1]), "loss": float(loss),
                                  "loss_le": float(loss_le), "drift_mm": (o["drift_at_peak"][:2] / MM).tolist(),
                                  "past_peak": o["past_peak"][:2].tolist(), "unloaded": o["unloaded"][:2].tolist(),
                                  "p_at_peak": o["p_at_peak"][:2].tolist(), "max_grad": o["max_grad"]}
        print(f"{dk:9s} {dp / MM:5.0f}   {bb.n:5.2f}  {pk[0] / KN:9.2f}  {o['drift_at_peak'][0] / MM:8.1f}   "
              f"{pk[1] / KN:8.2f}  {o['drift_at_peak'][1] / MM:8.1f}   {loss:6.1%}  ({loss_le:6.1%})        "
              f"{o['past_peak'][0]:.2f} | {o['past_peak'][1]:.2f}                              "
              f"{o['unloaded'][0]:.2f} | {o['unloaded'][1]:.2f}")
h72 = min(losses) >= 0.40
print(f"rigid-plastic (milestone 14): loss {M14['B']['z < 12 in']['loss']:.1%}")
print(f"H72 (loss >= 40% at every backbone): range {min(losses):.1%} to {max(losses):.1%}: "
      f"{'held' if h72 else 'refuted'}")


def centre(p, drift):
    """Instantaneous centre of the sheet's motion relative to the frame-free ground, from the sheet's
    (u, v, theta) about its centre; returned as (x, z) in inches from the sheet's bottom-left corner."""
    u, v, th = p
    return ((R.WIDTH / 2 - v / th) / IN, (HEIGHT / 2 + u / th) / IN)


cb = C["monotonic|12"]
ci, cw = centre(cb["p_at_peak"][0], 0), centre(cb["p_at_peak"][1], 0)
print(f"sheet's centre of rotation at peak (base backbone), in from bottom-left: intact ({ci[0]:.1f}, {ci[1]:.1f}), "
      f"Weiss ({cw[0]:.1f}, {cw[1]:.1f})")
print(f"largest Newton residual over the sweep: {max(c['max_grad'] for c in C.values()):.1e} Fp\n")
out["C"] = C
out["C_centre_in"] = {"intact": ci, "weiss": cw}

# curves for the figure
ob = push(np.vstack([ALL, WEISS[None]]), BASE)
oe = push(np.vstack([ALL, WEISS[None]]), S.Backbone.elastic_plastic(FP, 2 * MM))
out["curves"] = {"drift_mm": (ob["drifts"] / MM)[::4].tolist(), "base": (ob["curves"][:, ::4] / KN).tolist(),
                 "epp_2mm": (oe["curves"][:, ::4] / KN).tolist()}

# ------------------------------------------------------------------ D. single-nail losses
print("## D. One nail missed alone, base backbone: peak lost")
single = np.ones((62, 62), bool)
np.fill_diagonal(single, False)
os1 = push(single, BASE)
loss1 = 1 - os1["peak"] / ob["peak"][0]
groups = {"left joint edge": slice(0, 17), "right joint edge": slice(17, 34), "field stud 1": slice(34, 41),
          "field stud 2": slice(41, 48), "bottom plate": slice(48, 55), "top plate": slice(55, 62)}
D1 = {}
m14s = M14["C"]["single_loss"]
for g, s in groups.items():
    v = loss1[s]
    D1[g] = [float(x) for x in v]
    print(f"{g:17s}: mean {v.mean():.2%}, min {v.min():.2%}, max {v.max():.2%} (milestone 14 mean "
          f"{np.mean(m14s[g]):.2%})")
print(f"sum of the 62 single losses: {loss1.sum():.3f} (milestone 14: {M14['C']['sum']:.3f})\n")
out["D"] = {"single_loss": D1, "sum": float(loss1.sum()), "joint_mean": float(loss1[:34].mean())}

# ------------------------------------------------------------------ E. H73: escaped misses
print("## E. Every miss escapes, three reads on measured studs (20,000 sheets, seed 7), base backbone")
I0 = float(ob["peak"][0])
pk3, o3 = S.unique_peak(r3["hits"], XZ, FR, BASE)
cap3 = pk3 / I0
walls = cap3[rng.integers(0, N, (WALLS, 4))].mean(axis=1)
m14d = M14["D"]["single 2x, three reads"]
mean_loss, p99 = 1 - cap3.mean(), 1 - np.percentile(cap3, 1)
m14_mean, m14_p99 = 1 - m14d["mean_cap"], 1 - m14d["p1_cap"]
h73 = abs(mean_loss - m14_mean) <= 0.01 and abs(p99 - m14_p99) <= 0.01
print(f"{len(o3['peak'])} distinct patterns; mean loss {mean_loss:.2%} (milestone 14: {m14_mean:.2%}), 99th-percentile "
      f"loss {p99:.2%} ({m14_p99:.2%}), P(cap < 0.95) {(cap3 < 0.95).mean():.4f} ({m14d['p_below_95']:.4f}), "
      f"4-sheet wall p1 {np.percentile(walls, 1):.4f} ({m14d['wall_p1']:.4f}); per miss {mean_loss / r3['missed']:.2%}")
print(f"H73 (mean and p99 loss each within 1 point of milestone 14's): {'held' if h73 else 'refuted'}")
# the cyclic backbone too
CYC = S.Backbone.from_tests(FP, 12 * MM, K40, DU["cyclic"])
I0c = float(push(ALL, CYC)["peak"][0])
pk3c, _ = S.unique_peak(r3["hits"], XZ, FR, CYC)
cap3c = pk3c / I0c
print(f"cyclic du ({DU['cyclic'] / MM:.1f} mm): mean loss {1 - cap3c.mean():.2%}, 99th-percentile loss "
      f"{1 - np.percentile(cap3c, 1):.2%}\n")
out["E"] = {"patterns": int(len(o3["peak"])), "mean_loss": float(mean_loss), "p99_loss": float(p99),
            "p_below_95": float((cap3 < 0.95).mean()), "wall_p1": float(np.percentile(walls, 1)),
            "m14": [m14_mean, m14_p99], "cyclic": [float(1 - cap3c.mean()), float(1 - np.percentile(cap3c, 1))],
            "max_grad": o3["max_grad"]}

# ------------------------------------------------------------------ F. H74: 4 in joint edges
print("## F. Joint edges at 4 in (25 a side), every miss escapes, base backbone")
zj4 = np.linspace(EDGE, HEIGHT - EDGE, 25)
xz4, fr4 = R.layout(z_joint=zj4)
r4 = Q.clean(framing="2x", policy="three", rock_draw=ROCK, profiles=MEAS, warp="straight", trials=N, seed=7,
             hits=True, u_joint=zj4 / HEIGHT)
in4 = float(S.pushover(np.ones((1, xz4.shape[0]), bool), xz4, fr4, BASE)["peak"][0])
pk4, _ = S.unique_peak(r4["hits"], xz4, fr4, BASE)
cap4 = pk4 / I0
p_ok = float((cap4 >= 1.0 - 1e-9).mean())
h74 = p_ok >= 0.99
print(f"intact 4 in-joint sheet {in4 / I0:.3f} of the 6 in sheet (milestone 14: {M14['E']['intact']:.3f}); misses "
      f"{r4['missed']:.3f} a sheet; with misses mean {cap4.mean():.4f}, p1 {np.percentile(cap4, 1):.4f}, "
      f"min {cap4.min():.4f}")
print(f"H74 (>= the intact 6 in sheet in 99% of sheets): P = {p_ok:.4f}: {'held' if h74 else 'refuted'}\n")
out["F"] = {"intact": in4 / I0, "missed": r4["missed"], "mean_cap": float(cap4.mean()),
            "p1_cap": float(np.percentile(cap4, 1)), "min_cap": float(cap4.min()), "p_ok": p_ok}

# ------------------------------------------------------------------ G. post hoc: why softening changes so little
print("## G. Post hoc, not registered: how unequal the nails' slips are at the sheet's peak, and brittle nails")
c_, M_ = R._slip_terms(XZ, FR)
G = {}
for lab, m, pp, dd in (("intact", ALL[0], cb["p_at_peak"][0], cb["drift_mm"][0]),
                       ("Weiss", WEISS, cb["p_at_peak"][1], cb["drift_mm"][1])):
    s = (dd * MM / HEIGHT) * c_ + np.einsum("nij,j->ni", M_, np.array(pp))
    r = np.linalg.norm(s, axis=1)[m]
    G[lab] = {"slip_mm": [float(r.min() / MM), float(np.median(r) / MM), float(r.max() / MM)],
              "cv": float(r.std() / r.mean()), "frac_within_20pct": float(np.mean(np.abs(r / np.median(r) - 1) <= 0.2))}
    print(f"{lab:6s}: nail slip at the sheet's peak min {r.min() / MM:.1f}, median {np.median(r) / MM:.1f}, "
          f"max {r.max() / MM:.1f} mm; CV {r.std() / r.mean():.2f}; within 20% of the median: "
          f"{G[lab]['frac_within_20pct']:.2f}")
print("brittle nails (Fp at dp = 12 mm, falling to 0.8 Fp 1 mm later and to zero 5 mm after the peak):")
BR = S.Backbone.from_tests(FP, 12 * MM, K40, 13 * MM)
obr = push(np.vstack([ALL, WEISS[None]]), BR, step=0.1 * MM)
lbr = 1 - obr["peak"][1] / obr["peak"][0]
print(f"  intact {obr['peak'][0] / KN:.2f} kN at {obr['drift_at_peak'][0] / MM:.1f} mm, Weiss {obr['peak'][1] / KN:.2f} kN "
      f"at {obr['drift_at_peak'][1] / MM:.1f} mm: loss {lbr:.1%}\n")
G["brittle_loss"] = float(lbr)
out["G"] = G

QS = np.linspace(0, 100, 201)
out["cap_quantiles"] = {"q": QS.tolist(), "three reads": np.percentile(cap3, QS).tolist(),
                        "three reads, cyclic du": np.percentile(cap3c, QS).tolist(),
                        "three reads, 4 in joint edges": np.percentile(cap4, QS).tolist()}
out["hypotheses"] = {k: bool(v) for k, v in {"H70": h70, "H71": h71, "H72": h72, "H73": h73, "H74": h74}.items()}
out["seconds"] = round(time.time() - T0, 1)
json.dump(out, open(os.path.join(HERE, "results.json"), "w"), indent=1)
print(f"{out['seconds']} s")
