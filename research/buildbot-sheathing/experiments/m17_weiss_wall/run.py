"""Milestone 17: does Weiss's own wall, with its anchorage, explain the decay loss?

    OMP_NUM_THREADS=1 python experiments/m17_weiss_wall/run.py > experiments/m17_weiss_wall/results.txt

Weiss (2017, MS thesis, Washington State University) tested 8 by 8 ft walls of two 4 by 8 ft OSB sheets
with hold-downs on the double end studs only, and simulated decay by omitting every nail below 12 in.
This builds that wall in milestone 15's rigid-body limit analysis (``wall_lp.Wall``) and compares its
losses with her Table 5-2. H75-H80 were registered in LOG.md before this script was run. Reads milestone
14's inputs (../m11_measured/profiles.json, ../m6b_bowed_edge/results.json);
writes results.json beside this file. Needs numpy and scipy; about 10 minutes on four CPUs.
"""
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
from buildbot_sheathing import ceiling as Q  # noqa: E402
from buildbot_sheathing import frame_lp as L  # noqa: E402
from buildbot_sheathing import measured as M  # noqa: E402
from buildbot_sheathing import racking as R  # noqa: E402
from buildbot_sheathing import wall_lp as W  # noqa: E402
from buildbot_sheathing.asbuilt import STUD_LEN  # noqa: E402
from buildbot_sheathing.budget import IN, SPACING  # noqa: E402

T0 = time.time()
N = 20000
LB_PER_KN = 224.809
out = {"versions": {"python": platform.python_version(), "numpy": np.__version__, "scipy": scipy.__version__},
       "trials": N, "seed": 7}

# Weiss (2017) Table 5-2 (group means, lb) and Table 5-3 (MCASHEW2's share kept)
TEST = {"control 6-12": 4688, "decay 6-12": 2649, "control 3-12": 8775, "decay 3-12": 2974}
WALLS = {"control 6-12": [4556, 4819], "decay 6-12": [2786, 2220, 2942],
         "control 3-12": [8892, 8658], "decay 3-12": [3058, 2890]}       # Table 5-1, max load per wall
KEPT = {6: TEST["decay 6-12"] / TEST["control 6-12"], 3: TEST["decay 3-12"] / TEST["control 3-12"]}
MCASHEW = {6: 0.53, 3: 0.46}
FP_KN = 0.972        # 8d common, 7/16 in OSB, SPF, monotonic peak (Shameli Derakshan et al. 2019, Table 2)

print("# Milestone 17: Weiss's wall and its anchorage (buildbot-sheathing)")
print("Weiss (2017): 8x8 ft, two vertical 4x8 ft 7/16 in OSB sheets on a single middle stud, DF-L No. 2 studs at "
      "16 in, double end studs, single sill bolted down, double top plate, HTT4 hold-downs on the double end studs "
      "only; decay = every nail below 12 in omitted. Model: rigid-body limit analysis (LP, HiGHS), sill fixed, top "
      "plate, 7 studs (double end studs as one body) and 2 sheets as bodies; sheathing nails rigid-plastic (F, "
      "64-gon); stud-to-plate joints of lateral capacity lat F per 16d end nail (2 per single stud, 4 per double), "
      "bearing in compression, opening against omega F; rigid hold-downs; top plate without rotation. Capacities in "
      "units of F per unit top displacement.\n")

# ------------------------------------------------------------------ A. inputs
print("## A. Inputs")
F8 = L.fe_dowel(0.50)
z8, m8 = L.z_single_shear(0.131, 7 / 16, 2.5 - 7 / 16, F8, F8, L.fyb(0.131))
z16, m16 = L.z_single_shear(0.162, 1.5, 2.0, F8, F8, L.fyb(0.162))
LAT = 0.67 * z16 / z8
print(f"NDS yield limit (G 0.50, R_d 2.2): 8d common through 7/16 in OSB Z = {z8:.1f} lb (mode {m8}); 16d common "
      f"through a 1.5 in plate Z = {z16:.1f} lb (mode {m16}); one end nail at C_eg 0.67 = {0.67 * z16:.1f} lb; "
      f"lat = {LAT:.4f} F per end nail")
print("Weiss Table 5-2 (means, lb): " + ", ".join(f"{k} {v}" for k, v in TEST.items()))
print(f"share kept: 6-12 {KEPT[6]:.3f}, 3-12 {KEPT[3]:.3f}; decay 3-12 over decay 6-12 "
      f"{TEST['decay 3-12'] / TEST['decay 6-12']:.3f}; control 3-12 over 6-12 {TEST['control 3-12'] / TEST['control 6-12']:.3f}; "
      f"MCASHEW2 (Table 5-3) kept 6-12 {MCASHEW[6]:.2f}, 3-12 {MCASHEW[3]:.2f}\n")
out["A"] = {"z8": z8, "mode8": m8, "z16": z16, "mode16": m16, "lat": LAT, "test": TEST, "walls": WALLS,
            "kept": KEPT, "mcashew": MCASHEW}

WL = {e: W.weiss_wall(e) for e in (6.0, 3.0)}
DM = {e: W.decay_mask(WL[e].xz) for e in WL}
BASE = dict(lat=LAT, omega=0.0, top="norot")

# ------------------------------------------------------------------ B. H75
print("## B. H75: one sheet in the wall LP against milestone 15's Frame")
xz1, fr1 = R.layout()
F1 = L.Frame(xz1, fr1)
W1 = W.Wall([(xz1, fr1)], studs=L.STUDS, nails=np.ones(4), width=R.WIDTH)
k1 = W.decay_mask(xz1)
devs = []
for top, kw in (("free", {}), ("slide", {"top_slide_only": True})):
    for rho in (None, L.nds_rho()["rho"]):
        for m in (None, k1):
            a = F1.capacity(m, rho=rho, omega=0.0, **kw)
            b = W1.capacity(m, lat=rho, omega=0.0, top=top)
            devs.append(abs(b / a - 1))
h75 = bool(max(devs) <= 1e-6)
print(f"8 cases (free and slide-only top plate, rigid and NDS joints, intact and Weiss): max relative difference "
      f"{max(devs):.1e}")
print("deviation from the plan: Frame has no rotation-free top plate, so the check uses its two top-plate modes")
print(f"H75 (within 1e-6): {'held' if h75 else 'refuted'}\n")
out["B"] = {"max_dev": max(devs)}

# ------------------------------------------------------------------ C. H76 controls
print("## C. H76: the intact walls")
CI = {e: WL[e].capacity(**BASE) for e in WL}
CR = {e: WL[e].capacity(lat=None, top="norot") for e in WL}
ratio_i = CI[3.0] / CI[6.0]
t_ratio = TEST["control 3-12"] / TEST["control 6-12"]
h76 = bool(abs(ratio_i / t_ratio - 1) <= 0.10)
fp_lb = FP_KN * LB_PER_KN
for e in (6.0, 3.0):
    lab = f"control {int(e)}-12"
    print(f"{lab}: {WL[e].n} nails, {CI[e]:.3f} F (pinned joints {CR[e]:.3f}); at Fp {FP_KN} kN = {fp_lb:.0f} lb: "
          f"{CI[e] * fp_lb:,.0f} lb against {TEST[lab]:,} lb tested ({CI[e] * fp_lb / TEST[lab]:.2f}); "
          f"F implied by the test {TEST[lab] / CI[e]:.0f} lb")
print(f"3-12 over 6-12: model {ratio_i:.3f}, tested {t_ratio:.3f} ({ratio_i / t_ratio - 1:+.1%})")
print(f"H76 (within 10%): {'held' if h76 else 'refuted'}")
print("(the absolute check is not like-for-like: the backbone is for SPF framing, Weiss's walls were DF-L)\n")
out["C"] = {"intact": CI, "pinned": CR, "ratio": ratio_i, "f_implied_lb": {e: TEST[f'control {int(e)}-12'] / CI[e] for e in CI}}

# ------------------------------------------------------------------ D. H77-H79 decay
print("## D. H77-H79: every nail below 12 in omitted")
CD = {e: WL[e].capacity(DM[e], **BASE) for e in WL}
k6, k3 = CD[6.0] / CI[6.0], CD[3.0] / CI[3.0]
rd = CD[3.0] / CD[6.0]
h77 = bool(0.47 <= k6 <= 0.67)
h78 = bool(0.24 <= k3 <= 0.44)
h79 = bool(rd <= 1.25)
print(f"decay 6-12: {CD[6.0]:.3f} F, keeps {k6:.1%} (tested {KEPT[6]:.1%}, MCASHEW2 {MCASHEW[6]:.0%})")
print(f"decay 3-12: {CD[3.0]:.3f} F, keeps {k3:.1%} (tested {KEPT[3]:.1%}, MCASHEW2 {MCASHEW[3]:.0%})")
print(f"decay 3-12 over decay 6-12: {rd:.3f} (tested {TEST['decay 3-12'] / TEST['decay 6-12']:.3f})")
print(f"H77 (6-12 keeps 47-67%): {'held' if h77 else 'refuted'}; H78 (3-12 keeps 24-44%): "
      f"{'held' if h78 else 'refuted'}; H79 (ratio <= 1.25): {'held' if h79 else 'refuted'}")
lone = L.Frame(xz1, fr1)
lone_k = lone.capacity(k1, rho=2 * LAT, omega=0.0) / lone.capacity(rho=2 * LAT, omega=0.0)
print(f"for comparison, milestone 15's lone sheet with a hold-down at each of its own end studs, same joints: keeps "
      f"{lone_k:.1%}\n")
out["D"] = {"decay": CD, "kept": {6: k6, 3: k3}, "ratio": rd, "lone_sheet_kept": lone_k}

# variants
print("### Variants (not scored): share kept, 6-12 | 3-12, and decay 3-12 over decay 6-12")
VAR = {}


def variant(label, kw_i=None, mask_fn=None):
    kw_i = kw_i or {}
    res = {}
    for e in (6.0, 3.0):
        kw = {**BASE, **kw_i}
        m = DM[e] if mask_fn is None else mask_fn(e)
        ci = WL[e].capacity(**kw)
        cd = WL[e].capacity(m, **kw)
        res[e] = (ci, cd)
    k = {e: (res[e][1] / res[e][0] if res[e][0] > 1e-9 else float("nan")) for e in res}
    r = res[3.0][1] / res[6.0][1] if res[6.0][1] > 1e-9 else float("nan")
    VAR[label] = {"intact": {e: res[e][0] for e in res}, "decay": {e: res[e][1] for e in res}, "ratio": r}
    print(f"{label:48s} intact {res[6.0][0]:6.2f} | {res[3.0][0]:6.2f}   kept {k[6.0]:6.1%} | {k[3.0]:6.1%}   ratio {r:5.2f}")


variant("registered")
variant("top plate free", {"top": "free"})
variant("top plate slides only", {"top": "slide"})
variant("no hold-downs", {"use_holddowns": False})
for h in (5.0, 10.0, 20.0, 40.0):
    variant(f"hold-downs of capacity {h:g} F", {"holddown": h})
for om in (0.25, 0.5, 1.0, 2.0):
    variant(f"withdrawal omega {om:g} F per end nail", {"omega": om})
variant("sheets bear on each other at x = 48 in", {"bear": ((0, 1, 48 * IN),)})
variant("pinned stud-to-plate joints", {"lat": None})
variant("decay: nails at z <= 12 in also omitted", mask_fn=lambda e: W.decay_mask(WL[e].xz, inclusive=True))
variant("decay: perimeter nails only (field kept)",
        mask_fn=lambda e: W.decay_mask(WL[e].xz, edges_only=True,
                                       x_field=[SPACING, 2 * SPACING, R.WIDTH + SPACING, R.WIDTH + 2 * SPACING]))
print()
out["D"]["variants"] = VAR


# ------------------------------------------------------------------ E. mechanism
def mechanism(e, mask, **kw):
    w = WL[e]
    c, mot, _ = w.capacity(mask, return_motion=True, **{**BASE, **kw})
    S = w.studs.size
    slide = [float(mot[1 + s, 0]) for s in range(S)]                      # stud bottom (z = 0) along the wall
    lift = [float(mot[1 + s, 1] + mot[1 + s, 2] * w.studs[s]) for s in range(S)]
    sheets = [mot[1 + S + k].tolist() for k in range(w.ns)]
    return c, slide, lift, sheets, mot[0].tolist()


print("## E. Mechanism the LP picks (per unit top-plate slide): each stud bottom's slide and lift (studs left to right), the sheets' rotation")
MECH = {}
for lab, e, m, kw in (("intact 6-12", 6.0, None, {}), ("decay 6-12", 6.0, DM[6.0], {}),
                      ("decay 3-12", 3.0, DM[3.0], {}), ("decay 6-12, lat x 0.5", 6.0, DM[6.0], {"lat": 0.5 * LAT}),
                      ("decay 3-12, lat x 0.5", 3.0, DM[3.0], {"lat": 0.5 * LAT})):
    c, sl, li, sh, top = mechanism(e, m, **kw)
    MECH[lab] = {"cap": c, "slide": sl, "lift": li, "sheets": sh, "top": top}
    print(f"{lab:22s} cap {c:6.2f}: slide " + " ".join(f"{v:+.3f}" for v in sl) + " | lift " +
          " ".join(f"{v:+.4f}" for v in li) + f" | sheet rot {sh[0][2] * IN:+.4f} {sh[1][2] * IN:+.4f} /in")
print()
out["E"] = MECH

# ------------------------------------------------------------------ F. post hoc: joint strength
print("## F. Post hoc, not registered: the stud-to-plate joint strength (multiple of the NDS ratio) against the tests")
FS = [1.0, 0.9, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5, 0.45, 0.4, 0.35, 0.3, 0.25, 0.2]
grid = {}
print("x NDS   intact 6-12  decay 6-12  kept 6-12   intact 3-12  decay 3-12  kept 3-12   decay ratio  control ratio")
for f in FS:
    v = {}
    for e in (6.0, 3.0):
        v[e] = (WL[e].capacity(lat=f * LAT), WL[e].capacity(DM[e], lat=f * LAT))
    grid[f] = v
    print(f"{f:5.2f}   {v[6.0][0]:11.2f}  {v[6.0][1]:10.2f}  {v[6.0][1] / v[6.0][0]:9.1%}   {v[3.0][0]:11.2f}  "
          f"{v[3.0][1]:10.2f}  {v[3.0][1] / v[3.0][0]:9.1%}   {v[3.0][1] / v[6.0][1]:11.3f}  {v[3.0][0] / v[6.0][0]:13.3f}")
n_end = int(WL[6.0].nails.sum())
print(f"frame sliding capacity: {n_end} end nails x lat = {n_end * LAT:.2f} F at the NDS ratio")


def sse(f):
    s = 0.0
    for e in (6.0, 3.0):
        s += (WL[e].capacity(DM[e], lat=f * LAT) / WL[e].capacity(lat=f * LAT) - KEPT[int(e)]) ** 2
    return s


fs = np.round(np.arange(0.30, 0.751, 0.01), 2)
errs = [sse(f) for f in fs]
fbest = float(fs[int(np.argmin(errs))])
kb = {e: WL[e].capacity(DM[e], lat=fbest * LAT) / WL[e].capacity(lat=fbest * LAT) for e in (6.0, 3.0)}
rb = WL[3.0].capacity(DM[3.0], lat=fbest * LAT) / WL[6.0].capacity(DM[6.0], lat=fbest * LAT)
print(f"least-squares fit to the two tested shares (grid 0.30-0.75 in 0.01): {fbest:.2f} x NDS: keeps "
      f"{kb[6.0]:.1%} (tested {KEPT[6]:.1%}) and {kb[3.0]:.1%} (tested {KEPT[3]:.1%}); decay ratio {rb:.3f} "
      f"(tested {TEST['decay 3-12'] / TEST['decay 6-12']:.3f}); rms error {np.sqrt(min(errs) / 2):.1%}")
per_nail = {k: TEST[k] / n_end for k in ("decay 6-12", "decay 3-12")}
print(f"if the decayed walls' capacity is the frame sliding on its {n_end} end nails: "
      + ", ".join(f"{k} {v:.0f} lb per nail" for k, v in per_nail.items())
      + f" (NDS Z for the 16d nail {z16:.0f} lb, x C_eg 0.67 = {0.67 * z16:.0f} lb); the controls imply F = "
      + ", ".join(f"{TEST[f'control {int(e)}-12'] / CI[e]:.0f}" for e in (6.0, 3.0))
      + " lb per sheathing nail (section C)")
print()
FB = fbest
out["F"] = {"grid": {str(f): {str(e): v[e] for e in v} for f, v in grid.items()}, "fit": fbest,
            "fit_kept": kb, "fit_ratio": rb, "rms": float(np.sqrt(min(errs) / 2)), "per_end_nail_lb": per_nail}

# ------------------------------------------------------------------ G. H80 escaped misses
print("## G. H80: every miss escapes, three reads on measured studs (20,000 sheets, seed 7), two sheets a wall")
D_ = json.load(open(os.path.join(HERE, "..", "m11_measured", "profiles.json")))
m6b = json.load(open(os.path.join(HERE, "..", "m6b_bowed_edge", "results.json")))
ROCK = np.radians(np.array(m6b["F_draws"]["drake_deg"]))
MEAS = M.model_profiles(D_["members"], "smooth", STUD_LEN)
r3 = Q.clean(framing="2x", policy="three", rock_draw=ROCK, profiles=MEAS, warp="straight", trials=N, seed=7,
             hits=True)
H3 = np.asarray(r3["hits"], bool)
pairs = np.hstack([H3[: N // 2], H3[N // 2:]])                 # wall k: sheets k and k + N/2
upairs, inv = np.unique(pairs, axis=0, return_inverse=True)
print(f"{len(np.unique(H3, axis=0))} distinct sheet patterns; {N // 2} walls, {len(upairs)} distinct wall patterns")


def _solve(args):
    mask, lat = args
    return WL[6.0].capacity(mask, lat=lat, omega=0.0, top="norot")


G = {}
with mp.Pool(4) as pool:
    for lab, lat in (("registered (NDS joints)", LAT), (f"joints at {FB:.2f} x NDS (section F fit)", FB * LAT)):
        ci = WL[6.0].capacity(lat=lat, omega=0.0, top="norot")
        vals = np.array(pool.map(_solve, [(p, lat) for p in upairs], chunksize=16))
        cap = vals[inv.ravel()] / ci
        G[lab] = {"mean_loss": float(1 - cap.mean()), "p99_loss": float(1 - np.percentile(cap, 1)),
                  "p_below_095": float((cap < 0.95).mean()), "min": float(cap.min())}
        print(f"{lab:40s}: mean loss {1 - cap.mean():.2%}, 99th-percentile loss {1 - np.percentile(cap, 1):.2%}, "
              f"P(cap < 0.95) {(cap < 0.95).mean():.4f}, min {cap.min():.4f}")
print("milestone 14, per sheet: mean loss 2.34%, 99th-percentile loss 11.49% (milestone 14 results.txt, H63)")
g = G["registered (NDS joints)"]
h80 = bool(abs(g["mean_loss"] - 0.0234) <= 0.01 and abs(g["p99_loss"] - 0.1149) <= 0.02)
print(f"H80 (mean within 1 point, p99 within 2 points): {'held' if h80 else 'refuted'}\n")
out["G"] = G

out["hypotheses"] = {"H75": h75, "H76": h76, "H77": h77, "H78": h78, "H79": h79, "H80": h80}
out["seconds"] = time.time() - T0
json.dump(out, open(os.path.join(HERE, "results.json"), "w"), indent=1, default=float)
print(f"{time.time() - T0:.1f} s")
