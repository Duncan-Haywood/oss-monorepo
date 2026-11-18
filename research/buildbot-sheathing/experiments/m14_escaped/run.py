"""Milestone 14: what an escaped missed nail does to a sheet's racking capacity.

    python experiments/m14_escaped/run.py > experiments/m14_escaped/results.txt

Reads ../m11_measured/profiles.json (the scanned studs), ../m6b_bowed_edge/results.json (the
smooth-bow seats) and ../m12_remedies/results.json (to check the reproduced cells); writes
results.json beside this file. H60-H64 were registered in LOG.md before this script was run.
About a minute on one CPU.
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
from buildbot_sheathing import cost as K  # noqa: E402
from buildbot_sheathing import cycle as C  # noqa: E402
from buildbot_sheathing import measured as M  # noqa: E402
from buildbot_sheathing import price as P  # noqa: E402
from buildbot_sheathing import racking as R  # noqa: E402
from buildbot_sheathing import straighten as S  # noqa: E402
from buildbot_sheathing.asbuilt import STUD_LEN, U_JOINT  # noqa: E402
from buildbot_sheathing.budget import EDGE, HEIGHT, IN, Z_JOINT  # noqa: E402

T0 = time.time()
MM = 1e-3
N = 20000
WALLS = 100000
D = json.load(open(os.path.join(HERE, "..", "m11_measured", "profiles.json")))
m6b = json.load(open(os.path.join(HERE, "..", "m6b_bowed_edge", "results.json")))
M12 = json.load(open(os.path.join(HERE, "..", "m12_remedies", "results.json")))
ROCK = np.radians(np.array(m6b["F_draws"]["drake_deg"]))
MEAS = M.model_profiles(D["members"], "smooth", STUD_LEN)
MID = S.Straightener("mid", U_JOINT, "pinned", 0.5e-3)
out = {"versions": {"python": platform.python_version(), "numpy": np.__version__}, "trials": N, "seed": 7}

XZ, FR = R.layout()
W0 = R.capacity(np.ones((1, XZ.shape[0]), bool), XZ, FR)[0][0]


def pct(a, qs=(50, 99)):
    return [float(v) for v in np.percentile(a, qs)]


print("# Milestone 14: what an escaped missed nail does to racking capacity (buildbot-sheathing)")
print("rigid-plastic fully anchored model (Källsner and Girhammar 2009): pinned framing, rigid sheet, equal "
      "rigid-plastic fasteners; capacity = least plastic work over the sheet's rigid motions. 4x8 sheet, "
      "6 in edge / 12 in field (62 nails). Capacities are ratios to the intact sheet.\n")

# ------------------------------------------------------------------ A. H60: spacing table
print("## A. Intact sheet against edge spacing (field 12 in), vs SDPWS Table 4.3A, 15/32 Structural I, 8d")
TABLE = {6: 280, 4: 430, 3: 550, 2: 730}
A = {}
print("edge in   nails   model ratio   table ratio   model / table")
for e, v in TABLE.items():
    xz, fr = R.layout_spacing(e)
    r = R.capacity(np.ones((1, xz.shape[0]), bool), xz, fr)[0][0] / W0
    A[e] = {"nails": int(xz.shape[0]), "model": float(r), "table": v / 280, "ratio": float(r / (v / 280))}
    print(f"{e:7d}   {xz.shape[0]:5d}   {r:11.3f}   {v / 280:11.3f}   {r / (v / 280):13.3f}")
h60 = all(abs(A[e]["ratio"] - 1) <= 0.10 for e in (4, 3, 2))
print(f"also: the 6 in sheet's capacity per nail-count share: work/nail = {W0 / 62 / HEIGHT:.3f} (F units per nail "
      "per unit strain, over the sheet height)")
print(f"H60 (4, 3 and 2 in within 10% of the table's ratios): {'held' if h60 else 'refuted'}\n")
out["A"] = A

# ------------------------------------------------------------------ B. H61: Weiss (2017)
print("## B. Every nail in the bottom 12 in omitted (Weiss 2017 simulated decay)")
z = XZ[:, 1]
B = {}
for lab, m in (("z < 12 in", z < 12 * IN - 1e-9), ("z <= 12 in", z <= 12 * IN + 1e-9)):
    keep = ~m
    r = R.relative(keep[None], XZ, FR)[0]
    B[lab] = {"omitted": int(m.sum()), "capacity": float(r), "loss": float(1 - r)}
    print(f"{lab:11s}: {m.sum():2d} of 62 nails omitted ({m.sum() / 62:.0%}), capacity {r:.3f}, loss {1 - r:.1%}")
h61 = B["z < 12 in"]["loss"] >= 0.40
print(f"H61 (loss at least 40% with z < 12 in omitted): {'held' if h61 else 'refuted'}\n")
out["B"] = B

# ------------------------------------------------------------------ C. H62: one nail missed
print("## C. One nail missed alone: capacity lost")
single = np.ones((62, 62), bool)
np.fill_diagonal(single, False)
loss1 = 1 - R.relative(single, XZ, FR)
groups = {"left joint edge": slice(0, 17), "right joint edge": slice(17, 34), "field stud 1": slice(34, 41),
          "field stud 2": slice(41, 48), "bottom plate": slice(48, 55), "top plate": slice(55, 62)}
C1 = {}
for g, s in groups.items():
    v = loss1[s]
    C1[g] = [float(x) for x in v]
    print(f"{g:17s}: mean {v.mean():.2%}, min {v.min():.2%}, max {v.max():.2%}")
jl = loss1[:34]
print("joint edge by height (in): " + ", ".join(f"{zz / IN:.1f}:{l:.2%}" for zz, l in zip(Z_JOINT, jl[:17])))
h62 = bool(jl.max() <= 0.04 and 0.01 <= jl.mean() <= 0.03)
print(f"sum of the 62 single losses: {loss1.sum():.3f} (1.0 if each nail carried exactly its share)")
print(f"H62 (each joint nail <= 4%, mean of the 34 in 1-3%): max {jl.max():.2%}, mean {jl.mean():.2%}: "
      f"{'held' if h62 else 'refuted'}\n")
out["C"] = {"single_loss": C1, "joint_mean": float(jl.mean()), "joint_max": float(jl.max()), "sum": float(loss1.sum())}

# ------------------------------------------------------------------ D. H63: escaped misses at simulated rates
print("## D. Every miss escapes: sheet and wall capacity (20,000 sheets, seed 7, measured studs, ledger)")
CELLS = {
    "single 2x, three reads": dict(framing="2x", policy="three", key="measured|three|no push|ledger"),
    "single 2x, full stack": dict(framing="2x", policy="local", straighten=MID, slide=0.5 * MM, shim=0.5 * MM,
                                  key="measured|local|mid push|slide+shim 0.5 mm"),
    "doubled joints, single read": dict(framing="2x2x", policy="single", key=None),
}
rng = np.random.default_rng(14)
Dres, CAP = {}, {}
print("pipeline                       clean    missed   m12 check   mean cap   p1 cap    P(cap<0.95)  4-sheet wall p1")
for lab, kw in CELLS.items():
    kw = dict(kw)
    key = kw.pop("key")
    r = Q.clean(rock_draw=ROCK, profiles=MEAS, warp="straight", trials=N, seed=7, hits=True, **kw)
    cap = R.unique_relative(r["hits"], XZ, FR, W0)
    walls = cap[rng.integers(0, N, (WALLS, 4))].mean(axis=1)
    chk = f"{M12['A'][key]['clean']:.4f}" if key else "  -   "
    CAP[lab] = cap
    Dres[lab] = {"clean": r["clean"], "missed": r["missed"], "mean_cap": float(cap.mean()),
                 "p1_cap": float(np.percentile(cap, 1)), "p_below_95": float((cap < 0.95).mean()),
                 "wall_p1": float(np.percentile(walls, 1)), "wall_mean": float(walls.mean()),
                 "loss_per_miss": float((1 - cap.mean()) / r["missed"]) if r["missed"] > 0 else None,
                 "cap_hist": np.histogram(cap, bins=np.linspace(0.80, 1.0, 41))[0].tolist()}
    print(f"{lab:29s}  {r['clean']:.4f}   {r['missed']:.3f}    {chk:8s}    {cap.mean():.4f}    "
          f"{np.percentile(cap, 1):.4f}    {(cap < 0.95).mean():.4f}       {np.percentile(walls, 1):.4f}")
d = Dres["single 2x, three reads"]
h63 = d["mean_cap"] > 0.97 and d["p1_cap"] > 0.90 and d["wall_p1"] >= 0.95
print(f"loss per escaped miss (three reads): {d['loss_per_miss']:.2%} of the sheet; full stack: "
      f"{Dres['single 2x, full stack']['loss_per_miss']:.2%}")
print(f"H63 (three reads: mean loss < 3%, p99 loss < 10%, 4-sheet wall >= 95% in 99%): mean loss "
      f"{1 - d['mean_cap']:.2%}, p99 loss {1 - d['p1_cap']:.2%}, wall p1 {d['wall_p1']:.4f}: "
      f"{'held' if h63 else 'refuted'}\n")
out["D"] = Dres

# which heights miss
r3 = Q.clean(framing="2x", policy="three", rock_draw=ROCK, profiles=MEAS, warp="straight", trials=N, seed=7,
             hits=True)
pm = 1 - r3["hits"].mean(axis=0)
print("miss rate by joint height, three reads (left | right): " + ", ".join(
    f"{zz / IN:.0f}:{a:.3f}|{b:.3f}" for zz, a, b in zip(Z_JOINT, pm[:17], pm[17:34])))
print(f"field and plate nails: miss rate {pm[34:].mean():.4f}")
cl = (~r3["hits"][:, :34]).sum(axis=1)
print(f"misses a sheet on the joint edges: P(0) {np.mean(cl == 0):.3f}, P(1) {np.mean(cl == 1):.3f}, "
      f"P(2) {np.mean(cl == 2):.3f}, P(3+) {np.mean(cl >= 3):.3f}; worst sheet {cl.max()} misses\n")
out["miss_by_height"] = {"left": pm[:17].tolist(), "right": pm[17:34].tolist(), "other": float(pm[34:].mean())}

# ------------------------------------------------------------------ E. H64: 4 in joint edges
print("## E. Joint edges nailed at 4 in (25 a side), plates 6 in, field 12 in; every miss escapes")
zj4 = np.linspace(EDGE, HEIGHT - EDGE, 25)
xz4, fr4 = R.layout(z_joint=zj4)
r4 = Q.clean(framing="2x", policy="three", rock_draw=ROCK, profiles=MEAS, warp="straight", trials=N, seed=7,
             hits=True, u_joint=zj4 / HEIGHT)
cap4 = R.unique_relative(r4["hits"], xz4, fr4, W0)
intact4 = R.capacity(np.ones((1, xz4.shape[0]), bool), xz4, fr4)[0][0] / W0
walls4 = cap4[rng.integers(0, N, (WALLS, 4))].mean(axis=1)
p_ok = float((cap4 >= 1.0 - 1e-9).mean())
h64 = p_ok >= 0.99
print(f"intact 4 in-joint sheet: {intact4:.3f} of the 6 in sheet; misses a sheet {r4['missed']:.3f} "
      f"(clean {r4['clean']:.4f}); with misses: mean {cap4.mean():.4f}, p1 {np.percentile(cap4, 1):.4f}, "
      f"min {cap4.min():.4f}; 4-sheet wall p1 {np.percentile(walls4, 1):.4f}")
print(f"H64 (>= the intact 6 in sheet in 99% of sheets): P = {p_ok:.4f}: {'held' if h64 else 'refuted'}\n")
out["E"] = {"intact": float(intact4), "missed": r4["missed"], "clean": r4["clean"], "mean_cap": float(cap4.mean()),
            "p1_cap": float(np.percentile(cap4, 1)), "min_cap": float(cap4.min()), "p_ok": p_ok,
            "wall_p1": float(np.percentile(walls4, 1))}

# ------------------------------------------------------------------ F. what the denser edges cost
print("## F. Dollars a sheet at 100 houses a year (milestone 7's 4,000 draws, base robot)")
p = K.draw(4000, 11)
t = P.draw_times(4000)
three = Dres["single 2x, three reads"]
c6 = P.pipeline_cost(p, t, 100, three["missed"], "three", "point", False, False)["total"]
spec = P.reads_spec("three", "point", False, False, t)
t_per_nail = K.robot_spec("base", p)["t_nail"] / 62
spec4 = dict(spec, extra=spec["extra"] + 16 * t_per_nail)
c4 = K.robot_cost("base", p, 100, 0.0, spec4, False)["total"]
dbl = Dres["doubled joints, single read"]
cd = K.robot_cost("base", p, 100, dbl["missed"], {"n": C.reads_per_sheet("single"), "ledger": True}, True)["total"]
for lab, c in (("6 in, three reads, every miss re-driven", c6), ("4 in joint edges, three reads, misses left", c4),
               ("doubled joints, single read", cd)):
    print(f"{lab:44s}: median ${np.median(c):.2f} [5-95%: ${np.percentile(c, 5):.2f}, ${np.percentile(c, 95):.2f}]")
print(f"4 in joint edges cheaper than doubled joints in {(c4 < cd).mean():.3f} of draws (median saving "
      f"${np.median(cd - c4):.2f}); cheaper than 6 in with re-drives by a median ${np.median(c6 - c4):.2f}")
print("(16 extra nails at milestone 7's per-nail robot seconds, t_nail / 62; nail material not priced, a few cents)\n")
out["F"] = {"six_rework": pct(c6, (5, 50, 95)), "four_left": pct(c4, (5, 50, 95)), "doubled": pct(cd, (5, 50, 95)),
            "p_four_beats_doubled": float((c4 < cd).mean())}

# ------------------------------------------------------------------ G. post hoc: if the model understates loss
print("## G. Post hoc, not registered: every loss scaled up by Weiss's ratio (H61 refuted)")
kW = 0.5 / B["z < 12 in"]["loss"]
G = {"k": float(kW)}
for lab, intact, cap in (("6 in, three reads", 1.0, CAP["single 2x, three reads"]),
                         ("6 in, full stack", 1.0, CAP["single 2x, full stack"]), ("4 in joint edges", intact4, cap4)):
    ck = intact - kW * (intact - cap)
    wk = ck[rng.integers(0, N, (WALLS, 4))].mean(axis=1)
    G[lab] = {"mean": float(ck.mean()), "p1": float(np.percentile(ck, 1)), "p_ge_1": float((ck >= 1.0 - 1e-9).mean()),
              "wall_p1": float(np.percentile(wk, 1))}
    print(f"{lab:18s} (k = {kW:.2f}): mean {ck.mean():.4f}, p1 {np.percentile(ck, 1):.4f}, "
          f"P(>= intact 6 in) {(ck >= 1.0 - 1e-9).mean():.4f}, 4-sheet wall p1 {np.percentile(wk, 1):.4f}")
print()
out["G"] = G
QS = np.linspace(0, 100, 201)
out["cap_quantiles"] = {"q": QS.tolist(), **{lab: np.percentile(c, QS).tolist() for lab, c in CAP.items()},
                        "single 2x, three reads, 4 in joint edges": np.percentile(cap4, QS).tolist()}
out["layout"] = {"xz_in": (XZ / IN).round(3).tolist(), "single_loss": loss1.tolist()}

out["hypotheses"] = {"H60": h60, "H61": h61, "H62": h62, "H63": h63, "H64": h64}
out["seconds"] = round(time.time() - T0, 1)
json.dump(out, open(os.path.join(HERE, "results.json"), "w"), indent=1)
print(f"{out['seconds']} s")
