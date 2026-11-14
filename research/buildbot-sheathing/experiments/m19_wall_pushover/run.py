"""Milestone 19: Weiss's wall pushed over with softening nails and slack at the anchor rods.

    OMP_NUM_THREADS=1 python experiments/m19_wall_pushover/run.py > experiments/m19_wall_pushover/results.txt

Milestone 17's wall (``wall_lp.Wall``) as a displacement model (``wall_push.PushWall``): milestone 16's sourced
sheathing-nail backbone, softening stud-to-plate joints, stiff bearing and hold-down ties, and an anchor rod at each
held-down stud bottom that bears only after a gap. H87-H92 were registered in LOG.md before this script was run.
Reads milestone 17's results.json; writes results.json beside this file. Needs numpy and scipy; about 10 minutes
on four CPUs.

Backbone: as milestone 16 (Shameli Derakshan, Zhou and Ni 2019, Table 2: 8d common, 7/16 in OSB, SPF).
Rod stiffness: NDS load/slip modulus for a dowel, wood-to-metal, 2 x 270,000 D^1.5 lb/in, D = 5/8 in.
Rod cap: milestone 18's NDS yield-limit design value (2.55 F) and twice it.
"""
import itertools
import json
import multiprocessing as mp
import os
import platform
import sys
import time

import numpy as np
import scipy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from buildbot_sheathing import frame_lp as L  # noqa: E402
from buildbot_sheathing import racking as R  # noqa: E402
from buildbot_sheathing import softnail as S  # noqa: E402
from buildbot_sheathing import wall_lp as W  # noqa: E402
from buildbot_sheathing import wall_push as P  # noqa: E402
from buildbot_sheathing.budget import IN  # noqa: E402

T0 = time.time()
MM = 1e-3
KN = 1e3
STEP = 0.5 * MM
out = {"versions": {"python": platform.python_version(), "numpy": np.__version__, "scipy": scipy.__version__}}
M17 = json.load(open(os.path.join(HERE, "..", "m17_weiss_wall", "results.json")))

TEST = {"control 6-12": 4688, "decay 6-12": 2649, "control 3-12": 8775, "decay 3-12": 2974}
KEPT = {6.0: TEST["decay 6-12"] / TEST["control 6-12"], 3.0: TEST["decay 3-12"] / TEST["control 3-12"]}
NDS = 1.2971                                            # milestone 17: F per 16d end nail at the NDS ratio
FP = np.mean([0.95, 1.063, 0.904]) * KN
K40 = np.mean([0.514, 0.401, 0.574]) * KN / MM
DU = np.mean([28.3, 31.2, 26.7]) * MM
ROD_K = P.nds_rod_k(0.625)
WALLS = {e: W.weiss_wall(e) for e in (6.0, 3.0)}
KEEP = {e: W.decay_mask(w.xz) for e, w in WALLS.items()}

M_GRID = [0.25, 0.47, 0.75, 1.0]
LAM_GRID = [0.25, 0.5, 1.0]
GAP_GRID_IN = [0.0, 1 / 32, 1 / 16, 1 / 8, 1 / 4]
CAP_GRID = [2.55, 5.1]
DP_GRID = [6 * MM, 12 * MM]


def sheath_bb(dp):
    return S.Backbone.from_tests(FP, dp, K40, DU)


def joint_bb(m, lam, dp):
    sb = sheath_bb(dp)
    return S.Backbone(m * NDS * FP, lam * dp, sb.n, lam * DU)


def push(args):
    edge, decayed, m, lam, gap_in, cap, dp = args
    w = WALLS[edge]
    pw = P.PushWall(w, KEEP[edge] if decayed else None, sheath_bb(dp), joint_bb(m, lam, dp),
                    rod_gap=gap_in * IN, rod_k=ROD_K, rod_cap=cap * FP)
    o = pw.pushover(step=STEP)
    split = pw.work_split(o["q_at_peak"])
    return args, {"peak_F": o["peak"] / FP, "drift_mm": o["drift_at_peak"] / MM, "res": o["max_res"], "res_pk": o["res_to_peak"],
                  "unloaded": o["unloaded"], "split": split}


def pct(x):
    return f"{100 * x:.1f}%"


print("# Milestone 19: Weiss's wall pushed over, softening nails and slack at the anchor rods (buildbot-sheathing)")
print("Milestone 17's bodies (sill fixed; top plate pushed along the wall without rotating; 7 studs, 2 sheets) joined by "
      "springs: milestone 16's sourced 8d backbone along each sheathing nail's slip; 16d end-nail joints as 1-D "
      "backbones along the wall (peak m x 1.297 Fp a nail, slip scale lambda); stiff one-sided bearing, stiff ties at "
      "the held-down end-stud bottoms; an anchor rod there that bears after a gap g (NDS modulus, capped at c Fp). "
      "Pushed to 150 mm in 0.5 mm steps; least-energy state at each step. Loads in units of Fp.\n")
print("## A. Inputs")
print(f"sheathing nail: Fp {FP / KN:.3f} kN, K at 0.4 Fp {K40 * MM / KN:.3f} kN/mm, du {DU / MM:.1f} mm (monotonic), "
      f"dp swept {[round(d / MM) for d in DP_GRID]} mm")
print(f"rod: k = 2 x 270,000 x 0.625^1.5 lb/in = {ROD_K * MM / KN:.1f} kN/mm; cap {CAP_GRID} Fp "
      "(milestone 18's design value and twice it); gaps (in) " + ", ".join(f"{g:.4f}" for g in GAP_GRID_IN))
print(f"joints: m {M_GRID} of the NDS ratio, lambda {LAM_GRID}\n")
out["inputs"] = {"Fp_N": FP, "K40_N_per_m": K40, "du_m": DU, "rod_k_N_per_m": ROD_K}

# ------------------------------------------------------------------ B. H87
print("## B. H87: elastic-perfectly-plastic springs (0.1 mm yield) against the wall LP")
errs = []
rows = []
for edge in (6.0, 3.0):
    w = WALLS[edge]
    for m in (0.47, 1.0):
        for cap in (0.0, 2.55):
            for dec in (False, True):
                mk = KEEP[edge] if dec else None
                epp = S.Backbone.elastic_plastic(FP, 0.1 * MM)
                jb = S.Backbone.elastic_plastic(m * NDS * FP, 0.1 * MM)
                pw = P.PushWall(w, mk, epp, jb, rod_gap=0.0, rod_k=FP / (0.1 * MM), rod_cap=cap * FP)
                o = pw.pushover(step=2 * MM)
                lp = w.capacity(mk, lat=m * NDS, hd_shear=cap)
                e = o["final"] / FP / lp - 1
                errs.append(abs(e))
                rows.append({"edge": edge, "m": m, "cap": cap, "decayed": dec, "push": o["final"] / FP, "lp": lp})
                print(f"{edge:.0f}-12 {'decay ' if dec else 'intact'} m {m:.2f} cap {cap:.2f}: push {o['final'] / FP:7.3f} F, "
                      f"LP {lp:7.3f} F ({e:+.3%}), residual {o['max_res']:.1e}")
h87 = max(errs) <= 0.02
print(f"H87 (within 2% in all 16): max {max(errs):.3%}: {'held' if h87 else 'refuted'}\n")
out["B"] = {"rows": rows, "max_err": max(errs), "held": h87}

# ------------------------------------------------------------------ C. H88
print("## C. H88: one sheet with pinned joints against milestone 16's pushover (dp 12 mm)")
XZ, FR = R.layout()
ONLINE = np.array([0.375 * IN, L.STUDS[1], L.STUDS[2], R.WIDTH - 0.375 * IN])
masks = {"intact": np.ones(XZ.shape[0], bool), "Weiss pattern": XZ[:, 1] >= 12 * IN - 1e-9}
C = {}
for label, studs in (("milestone 15's studs (registered)", L.STUDS), ("pins on the edge-nail lines", ONLINE)):
    one = W.Wall([(XZ, FR)], studs=studs, nails=np.ones(4), width=R.WIDTH)
    for k, mk in masks.items():
        pw = P.PushWall(one, mk, sheath_bb(12 * MM), None)
        o = pw.pushover(step=STEP)
        ref = S.pushover(mk[None], XZ, FR, sheath_bb(12 * MM), step=STEP)
        e = o["peak"] / float(ref["peak"][0]) - 1
        C[f"{label}, {k}"] = {"push_N": o["peak"], "m16_N": float(ref["peak"][0]), "err": e}
        print(f"{label}, {k}: {o['peak'] / KN:.3f} kN against {ref['peak'][0] / KN:.3f} kN ({e:+.3%}); drift at peak "
              f"{o['drift_at_peak'] / MM:.1f} against {ref['drift_at_peak'][0] / MM:.1f} mm")
h88 = all(abs(v["err"]) <= 0.01 for k, v in C.items() if k.startswith("milestone 15"))
print("(milestone 16's parallelogram moves every stud nail along the wall only; a rigid stud pinned on its centre "
      "line also moves a nail 3/8 in off that line vertically, by theta x 3/8 in. With the pins on the nail lines "
      "the two models are the same.)")
print(f"H88 (registered studs, within 1%): {'held' if h88 else 'refuted'}\n")
out["C"] = {"cases": C, "held": h88}

# ------------------------------------------------------------------ D. the grid
jobs = [(e, d, m, lam, g, c, dp) for e in (6.0, 3.0) for d in (False, True) for m in M_GRID for lam in LAM_GRID
        for g in GAP_GRID_IN for c in CAP_GRID for dp in DP_GRID]
with mp.Pool(min(4, os.cpu_count() or 1)) as pool:
    res = dict(pool.map(push, jobs, chunksize=4))
worst = max(v["res"] for v in res.values())
worst_pk = max(v["res_pk"] for v in res.values())
bad = [k for k, v in res.items() if v["res_pk"] > 1e-3]
unl = np.array([v["unloaded"] for v in res.values()])
print(f"## D. Grid: {len(jobs)} pushovers; largest residual up to the peak {worst_pk:.1e} Fp ({len(bad)} runs above "
      f"1e-3 Fp), over the whole push {worst:.1e} Fp (after the peak a softening wall can snap, and Newton then "
      f"reports the step it could not settle); share of held nails read back down before the peak: median "
      f"{np.median(unl):.1%}, 90th percentile {np.quantile(unl, 0.9):.1%}, largest {unl.max():.1%}\n")
for k in bad[:10]:
    print(f"  not settled before its peak: {k}: {res[k]['res_pk']:.1e} Fp")
out["diagnostics"] = {"res_to_peak": worst_pk, "res": worst, "n_bad": len(bad), "unloaded_median": float(np.median(unl)),
                      "unloaded_p90": float(np.quantile(unl, 0.9)), "unloaded_max": float(unl.max())}


def share(edge, m, lam, g, c, dp):
    a = res[(edge, False, m, lam, g, c, dp)]["peak_F"]
    b = res[(edge, True, m, lam, g, c, dp)]["peak_F"]
    return b / a


grid = []
for m, lam, g, c, dp in itertools.product(M_GRID, LAM_GRID, GAP_GRID_IN, CAP_GRID, DP_GRID):
    s6, s3 = share(6.0, m, lam, g, c, dp), share(3.0, m, lam, g, c, dp)
    d6 = res[(6.0, True, m, lam, g, c, dp)]["peak_F"]
    d3 = res[(3.0, True, m, lam, g, c, dp)]["peak_F"]
    rms = np.sqrt(((s6 - KEPT[6.0]) ** 2 + (s3 - KEPT[3.0]) ** 2) / 2)
    grid.append({"m": m, "lam": lam, "gap_in": g, "cap": c, "dp_mm": dp / MM, "kept6": s6, "kept3": s3,
                 "ratio": d3 / d6, "rms": float(rms),
                 "intact6": res[(6.0, False, m, lam, g, c, dp)]["peak_F"],
                 "intact3": res[(3.0, False, m, lam, g, c, dp)]["peak_F"],
                 "drift_mm": {k: res[(e, d, m, lam, g, c, dp)]["drift_mm"]
                              for k, (e, d) in {"c6": (6.0, False), "d6": (6.0, True), "c3": (3.0, False),
                                                "d3": (3.0, True)}.items()}})
out["grid"] = grid


def find(**kw):
    for r in grid:
        if all(abs(r[k] - v) < 1e-9 for k, v in kw.items()):
            return r
    raise KeyError(kw)


print("### Share kept 6-12 | 3-12 (decay ratio), dp 12 mm, cap 2.55 F; rows m and lambda, columns gap (in)")
print("m     lam   " + "".join(f"{g:>22.4f}" for g in GAP_GRID_IN))
for m in M_GRID:
    for lam in LAM_GRID:
        cells = []
        for g in GAP_GRID_IN:
            r = find(m=m, lam=lam, gap_in=g, cap=2.55, dp_mm=12)
            cells.append(f"{pct(r['kept6'])}|{pct(r['kept3'])} ({r['ratio']:.2f})")
        print(f"{m:4.2f}  {lam:4.2f}  " + "".join(f"{c:>22}" for c in cells))
print(f"tested: {pct(KEPT[6.0])}|{pct(KEPT[3.0])} ({TEST['decay 3-12'] / TEST['decay 6-12']:.2f})\n")

# ------------------------------------------------------------------ E. H89-H91
lp = {}
for edge in (6.0, 3.0):
    w = WALLS[edge]
    lp[edge] = w.capacity(KEEP[edge], lat=NDS, hd_shear=2.55) / w.capacity(lat=NDS, hd_shear=2.55)
r89 = find(m=1.0, lam=1.0, gap_in=0.0, cap=2.55, dp_mm=12)
d89 = max(abs(r89["kept6"] - lp[6.0]), abs(r89["kept3"] - lp[3.0]))
h89 = d89 <= 0.05
print("## E. Registered checks")
print(f"H89: m 1, lambda 1, cap 2.55, no gap: pushover keeps {pct(r89['kept6'])} and {pct(r89['kept3'])}; LP "
      f"{pct(lp[6.0])} and {pct(lp[3.0])}; largest difference {100 * d89:.1f} points: {'held' if h89 else 'refuted'}")
a = find(m=0.47, lam=1.0, gap_in=0.0, cap=2.55, dp_mm=12)
b = find(m=0.47, lam=1.0, gap_in=1 / 16, cap=2.55, dp_mm=12)
drop = max(a["kept6"] - b["kept6"], a["kept3"] - b["kept3"])
h90 = drop <= 0.05
print(f"H90: m 0.47, lambda 1, cap 2.55: gap 0 keeps {pct(a['kept6'])}|{pct(a['kept3'])}, 1/16 in "
      f"{pct(b['kept6'])}|{pct(b['kept3'])}; largest drop {100 * drop:.1f} points: {'held' if h90 else 'refuted'}")
r91 = find(m=1.0, lam=0.25, gap_in=0.0, cap=2.55, dp_mm=12)
h91 = r91["kept3"] < 0.50
print(f"H91: m 1, lambda 0.25, cap 2.55, no gap: decayed 3-12 keeps {pct(r91['kept3'])} (6-12 {pct(r91['kept6'])}): "
      f"{'held' if h91 else 'refuted'}")
near = [r for r in grid if r["m"] >= 0.75 and abs(r["kept6"] - KEPT[6.0]) <= 0.10 and abs(r["kept3"] - KEPT[3.0]) <= 0.10]
h92 = bool(near)
print(f"H92: grid points with m >= 0.75 and both shares within 10 points: {len(near)}: {'held' if h92 else 'refuted'}")
best = min(grid, key=lambda r: r["rms"])
best75 = min((r for r in grid if r["m"] >= 0.75), key=lambda r: r["rms"])
for name, r in (("best overall", best), ("best with m >= 0.75", best75)):
    print(f"{name}: m {r['m']}, lambda {r['lam']}, gap {r['gap_in']:.4f} in, cap {r['cap']}, dp {r['dp_mm']:.0f} mm: "
          f"keeps {pct(r['kept6'])}|{pct(r['kept3'])} (rms {100 * r['rms']:.1f} points), decay ratio {r['ratio']:.2f}, "
          f"intact 3-12/6-12 {r['intact3'] / r['intact6']:.2f}; drift at peak (mm) c6 {r['drift_mm']['c6']:.1f}, "
          f"d6 {r['drift_mm']['d6']:.1f}, c3 {r['drift_mm']['c3']:.1f}, d3 {r['drift_mm']['d3']:.1f}")
within5 = sorted((r for r in grid if r["rms"] <= 0.05), key=lambda r: r["rms"])
print(f"grid points within 5 points rms: {len(within5)}")
for r in within5[:12]:
    print(f"  m {r['m']}, lambda {r['lam']}, gap {r['gap_in']:.4f}, cap {r['cap']}, dp {r['dp_mm']:.0f}: "
          f"{pct(r['kept6'])}|{pct(r['kept3'])} rms {100 * r['rms']:.1f}, ratio {r['ratio']:.2f}")
out["E"] = {"H89": {"push": [r89["kept6"], r89["kept3"]], "lp": [lp[6.0], lp[3.0]], "held": h89},
            "H90": {"gap0": [a["kept6"], a["kept3"]], "gap16": [b["kept6"], b["kept3"]], "held": h90},
            "H91": {"kept3": r91["kept3"], "kept6": r91["kept6"], "held": h91},
            "H92": {"n": len(near), "held": h92}, "best": best, "best_m75": best75, "within5": len(within5)}

# where the work goes at the best point, decayed 6-12
key = (6.0, True, best["m"], best["lam"], best["gap_in"], best["cap"], best["dp_mm"] * MM)
sp = res[key]["split"]
tot = sp.get("sheathing", 0) + sp.get("joints", 0) + sp.get("rod", 0)
bym = sp["sheathing_by_member"]
S7 = WALLS[6.0].studs.size
end = bym.get(1, 0.0) + bym.get(S7, 0.0)
print(f"\nat the best point, decayed 6-12 at its peak: energy in sheathing nails {pct(sp['sheathing'] / tot)}, end-nail "
      f"joints {pct(sp.get('joints', 0) / tot)}, rods {pct(sp.get('rod', 0) / tot)}; of the sheathing nails' energy "
      f"{pct(end / sp['sheathing'])} is on the double end studs, {pct(bym.get(1 + 3, 0.0) / sp['sheathing'])} on the middle stud")
out["E"]["best_split"] = {"sheathing": sp["sheathing"] / tot, "joints": sp.get("joints", 0) / tot,
                          "rod": sp.get("rod", 0) / tot, "end_studs": end / sp["sheathing"]}
print(f"\nruntime {time.time() - T0:.0f} s")
json.dump(out, open(os.path.join(HERE, "results.json"), "w"), indent=1, default=float)
