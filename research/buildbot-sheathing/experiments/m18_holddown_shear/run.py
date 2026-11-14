"""Milestone 18: does the hold-down's shear path stop Weiss's decayed wall sliding, and what joint strength fits then?

    OMP_NUM_THREADS=1 python experiments/m18_holddown_shear/run.py > experiments/m18_holddown_shear/results.txt

Milestone 17's post hoc fit (stud-to-plate joints at 0.47 times the NDS ratio) has Weiss's decayed wall slide
on its sill. In her set-up the double end studs are nailed to HTT4 hold-downs whose 5/8 in anchor rods pass
through the sill into the steel test beam, so the end studs cannot slide freely. This adds that shear path
(``Wall.capacity(hd_shear=...)``) and refits. H81-H86 were registered in LOG.md before this script was run.
Reads milestone 17's results.json and milestone 14's inputs; writes results.json beside this file. Needs numpy
and scipy; about 5 minutes on four CPUs.
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
from buildbot_sheathing import wall_lp as W  # noqa: E402
from buildbot_sheathing.asbuilt import STUD_LEN  # noqa: E402

T0 = time.time()
INF = float("inf")
out = {"versions": {"python": platform.python_version(), "numpy": np.__version__, "scipy": scipy.__version__}}
M17 = json.load(open(os.path.join(HERE, "..", "m17_weiss_wall", "results.json")))

# Weiss (2017) Table 5-2 (group means, lb) and Table 5-1 (max load per wall), as milestone 17
TEST = {"control 6-12": 4688, "decay 6-12": 2649, "control 3-12": 8775, "decay 3-12": 2974}
WALLS = {"control 6-12": [4556, 4819], "decay 6-12": [2786, 2220, 2942],
         "control 3-12": [8892, 8658], "decay 3-12": [3058, 2890]}
KEPT = {6.0: TEST["decay 6-12"] / TEST["control 6-12"], 3.0: TEST["decay 3-12"] / TEST["control 3-12"]}
T_RATIO = TEST["decay 3-12"] / TEST["decay 6-12"]
F_LB = {6.0: M17["C"]["f_implied_lb"]["6.0"], 3.0: M17["C"]["f_implied_lb"]["3.0"]}   # lb per sheathing nail

print("# Milestone 18: the hold-down's shear path on Weiss's decayed wall (buildbot-sheathing)")
print("Milestone 17's wall LP (wall_lp.Wall: sill fixed, top plate without rotation, 7 studs and 2 sheets as rigid "
      "bodies, rigid-plastic sheathing nails F and 16d end-nail joints, rigid vertical hold-downs at the double end "
      "studs) with one addition: each held-down stud bottom also resists sliding along the sill with hd_shear = s F "
      "(the HTT4's anchor rod bearing in the sill; s = 0 is milestone 17, s = inf no slide). Decay = every nail "
      "below 12 in omitted. Capacities in units of F per unit top-plate displacement.\n")

# ------------------------------------------------------------------ A. inputs
print("## A. Inputs")
F8 = L.fe_dowel(0.50)
z8, _ = L.z_single_shear(0.131, 7 / 16, 2.5 - 7 / 16, F8, F8, L.fyb(0.131))
z16, _ = L.z_single_shear(0.162, 1.5, 2.0, F8, F8, L.fyb(0.162))
LAT = 0.67 * z16 / z8
print(f"lat at the NDS ratio = {LAT:.4f} F per 16d end nail (milestone 17); implied F = {F_LB[6.0]:.0f} lb (6-12 "
      f"control), {F_LB[3.0]:.0f} lb (3-12 control)")


def z_bolt(D, ls, lm, Fes, Fem, Fyb, Kt=1.0):
    """NDS yield-limit equations, single shear, D > 1/4 in: R_d = 4 Kt (I), 3.6 Kt (II), 3.2 Kt (III, IV)."""
    Re, Rt = Fem / Fes, lm / ls
    k1 = (np.sqrt(Re + 2 * Re ** 2 * (1 + Rt + Rt ** 2) + Rt ** 2 * Re ** 3) - Re * (1 + Rt)) / (1 + Re)
    k2 = -1 + np.sqrt(2 * (1 + Re) + 2 * Fyb * (1 + 2 * Re) * D ** 2 / (3 * Fem * lm ** 2))
    k3 = -1 + np.sqrt(2 * (1 + Re) / Re + 2 * Fyb * (2 + Re) * D ** 2 / (3 * Fem * ls ** 2))
    modes = {"Im": D * lm * Fem / (4 * Kt), "Is": D * ls * Fes / (4 * Kt),
             "II": k1 * D * ls * Fes / (3.6 * Kt),
             "IIIm": k2 * D * lm * Fem / ((1 + 2 * Re) * 3.2 * Kt),
             "IIIs": k3 * D * ls * Fem / ((2 + Re) * 3.2 * Kt),
             "IV": D ** 2 / (3.2 * Kt) * np.sqrt(2 * Fem * Fyb / (3 * (1 + Re)))}
    m = min(modes, key=modes.get)
    return float(modes[m]), m


ROD = {}
for ts in (0.125, 0.25, 0.5):
    ROD[ts] = z_bolt(0.625, ts, 1.5, 87000.0, 11200.0 * 0.50, 45000.0)
ZROD = min(v[0] for v in ROD.values())
print("anchor rod, 5/8 in (F_yb 45,000 psi), bearing parallel to grain in a 1.5 in DF-L sill (F_e 11,200 G = 5,600 "
      "psi, G 0.50), steel side member (F_e 1.5 F_u = 87,000 psi, A36): Z = "
      + ", ".join(f"{v[0]:.0f} lb (mode {v[1]}, steel {ts} in)" for ts, v in ROD.items()))
SROD = ZROD / np.mean(list(F_LB.values()))
print(f"so one rod's design value is {SROD:.2f} F at the implied F (mean {np.mean(list(F_LB.values())):.0f} lb); "
      f"a tested ultimate is some multiple of that (1-5 x Z gives {SROD:.1f}-{5 * SROD:.1f} F)\n")
out["A"] = {"lat": LAT, "rod": {str(k): v for k, v in ROD.items()}, "z_rod_lb": ZROD, "s_rod_F": SROD,
            "f_lb": F_LB, "test": TEST, "walls": WALLS}

WL = {e: W.weiss_wall(e) for e in (6.0, 3.0)}
DM = {e: W.decay_mask(WL[e].xz) for e in WL}


def cap(args):
    e, decayed, f, s = args
    return WL[e].capacity(DM[e] if decayed else None, lat=f * LAT, omega=0.0, top="norot", hd_shear=s)


# ------------------------------------------------------------------ B. H81
print("## B. H81: code check")
dev = []
for e in (6.0, 3.0):
    dev.append(abs(cap((e, False, 1.0, 0.0)) / M17["C"]["intact"][str(e)] - 1))
    dev.append(abs(cap((e, True, 1.0, 0.0)) / M17["D"]["decay"][str(e)] - 1))
mono, same_inf = True, []
for e in (6.0, 3.0):
    for f in (0.3, 0.47, 1.0):
        vals = [cap((e, True, f, s)) for s in (0.0, 1.0, 4.0, 16.0, INF)]
        mono &= all(a <= b + 1e-9 for a, b in zip(vals, vals[1:]))
        same_inf.append(abs(cap((e, True, f, 1e4)) / vals[-1] - 1))
h81 = bool(max(dev) <= 1e-9 and mono and max(same_inf) <= 1e-6)
print(f"s = 0 against milestone 17's registered capacities (4 cases): max relative difference {max(dev):.1e}")
print(f"capacity never falls as s rises (2 schedules x 3 joint strengths x 5 values of s): {mono}")
print(f"s = inf against s = 10,000 F: max relative difference {max(same_inf):.1e}")
print(f"H81: {'held' if h81 else 'refuted'}\n")
out["B"] = {"dev": max(dev), "monotone": bool(mono), "inf_dev": max(same_inf)}

SS = [0.0, 1.0, 2.0, 4.0, 8.0, 16.0, INF]
FS = [round(x, 2) for x in np.arange(0.05, 1.501, 0.05)]
FF = [round(x, 2) for x in np.arange(0.05, 1.501, 0.01)]
jobs = sorted({(e, d, f, s) for s in SS for f in FS for e in (6.0, 3.0) for d in (False, True)}
              | {(e, d, f, INF) for f in FF for e in (6.0, 3.0) for d in (False, True)})
with mp.Pool(4) as pool:
    vals = pool.map(cap, jobs, chunksize=8)
C = dict(zip(jobs, vals))


def kept(e, f, s):
    return C[(e, True, f, s)] / C[(e, False, f, s)]


def ratio(f, s):
    return C[(3.0, True, f, s)] / C[(6.0, True, f, s)]


def rms(f, s):
    return float(np.sqrt(((kept(6.0, f, s) - KEPT[6.0]) ** 2 + (kept(3.0, f, s) - KEPT[3.0]) ** 2) / 2))


# ------------------------------------------------------------------ C. H82
print("## C. H82: a rigid shear path at NDS-ratio joints")
k6, k3 = kept(6.0, 1.0, INF), kept(3.0, 1.0, INF)
h82 = bool(0.47 <= k6 <= 0.67 and 0.24 <= k3 <= 0.44)
print(f"intact 6-12 {C[(6.0, False, 1.0, INF)]:.2f} F, decay {C[(6.0, True, 1.0, INF)]:.2f} F: keeps {k6:.1%} "
      f"(tested {KEPT[6.0]:.1%}; milestone 17 {M17['D']['kept']['6']:.1%})")
print(f"intact 3-12 {C[(3.0, False, 1.0, INF)]:.2f} F, decay {C[(3.0, True, 1.0, INF)]:.2f} F: keeps {k3:.1%} "
      f"(tested {KEPT[3.0]:.1%}; milestone 17 {M17['D']['kept']['3']:.1%})")
print(f"decay 3-12 over decay 6-12 {ratio(1.0, INF):.3f} (tested {T_RATIO:.3f})")
print(f"H82 (47-67% and 24-44%): {'held' if h82 else 'refuted'}\n")
out["C"] = {"kept": {6: k6, 3: k3}, "ratio": ratio(1.0, INF)}

# ------------------------------------------------------------------ D. H83, H84
print("## D. H83-H84: refit the joint strength with a rigid shear path (multiples of the NDS ratio, 0.05-1.50 by 0.01)")
fb = min(FF, key=lambda f: rms(f, INF))
rb = ratio(fb, INF)
h83 = bool(rms(fb, INF) <= 0.05)
h84 = bool(1.02 <= rb <= 1.25)
print(f"best fit {fb:.2f} x NDS: keeps {kept(6.0, fb, INF):.1%} (tested {KEPT[6.0]:.1%}) and {kept(3.0, fb, INF):.1%} "
      f"(tested {KEPT[3.0]:.1%}); rms {rms(fb, INF):.1%}; decay ratio {rb:.3f} (tested {T_RATIO:.3f}); intact 3-12 "
      f"over 6-12 {C[(3.0, False, fb, INF)] / C[(6.0, False, fb, INF)]:.3f} (tested "
      f"{TEST['control 3-12'] / TEST['control 6-12']:.3f})")
print(f"H83 (rms <= 5 points): {'held' if h83 else 'refuted'}; H84 (decay ratio 1.02-1.25): "
      f"{'held' if h84 else 'refuted'}")
lo = [f for f in FF if rms(f, INF) <= 0.05]
print(f"joint multiples within 5 points rms: " + (f"{min(lo):.2f}-{max(lo):.2f}" if lo else "none"))
# absolute check at the fit: decayed walls in lb at the controls' implied F
for e in (6.0, 3.0):
    lab = f"decay {int(e)}-12"
    print(f"{lab}: {C[(e, True, fb, INF)]:.2f} F x {F_LB[e]:.0f} lb = {C[(e, True, fb, INF)] * F_LB[e]:,.0f} lb "
          f"against {TEST[lab]:,} lb (walls {', '.join(f'{v:,}' for v in WALLS[lab])})")
print()
out["D"] = {"fit": fb, "kept": {6: kept(6.0, fb, INF), 3: kept(3.0, fb, INF)}, "rms": rms(fb, INF), "ratio": rb,
            "within5": [min(lo), max(lo)] if lo else None,
            "curve": {str(f): [kept(6.0, f, INF), kept(3.0, f, INF), ratio(f, INF)] for f in FF}}

print("### Share kept 6-12 | 3-12 and decay ratio, by shear path s (rows) and joint multiple (columns)")
GRID = {}
show = [0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1.0, 1.2]
print("s (F)    " + "".join(f"{f:>21.2f}" for f in show))
for s in SS:
    row = []
    for f in show:
        row.append(f"{kept(6.0, f, s):5.1%}|{kept(3.0, f, s):5.1%} {ratio(f, s):4.2f}")
    print(f"{s:>6g}   " + "".join(f"{r:>21s}" for r in row))
for s in SS:
    fbs = min(FS, key=lambda f: rms(f, s))
    GRID[str(s)] = {"fit": fbs, "rms": rms(fbs, s), "ratio": ratio(fbs, s),
                    "kept": {str(f): [kept(6.0, f, s), kept(3.0, f, s)] for f in FS}}
print("best fit per s (0.05 grid): " + "; ".join(f"s {s:g}: {GRID[str(s)]['fit']:.2f} x NDS, rms "
                                                 f"{GRID[str(s)]['rms']:.1%}, ratio {GRID[str(s)]['ratio']:.2f}" for s in SS))
print()
out["grid"] = GRID


# ------------------------------------------------------------------ E. H85 mechanism
def mech(e, f, s):
    w = WL[e]
    c, mot, x = w.capacity(DM[e], lat=f * LAT, omega=0.0, top="norot", hd_shear=s, return_motion=True)
    nq = 3 * w.nb
    idx = np.flatnonzero(DM[e])
    t = x[nq:nq + idx.size]
    mem = w.member[idx]
    S = w.studs.size
    groups = {"end studs": np.isin(mem, (1, S)), "middle stud": mem == 1 + S // 2,
              "other studs": (mem >= 1) & ~np.isin(mem, (1, S, 1 + S // 2)), "sill": mem == -1, "top plate": mem == 0}
    tot = t.sum()
    share = {k: float(t[g].sum() / tot) if tot > 0 else 0.0 for k, g in groups.items()}
    slide = [float(mot[1 + k, 0]) for k in range(S)]
    return c, share, slide, float(tot)


print("## E. H85: where the decayed wall's sheathing nails do their work (share of sheathing-nail dissipation)")
MECH = {}
for lab, e, f, s in ((f"decay 6-12, fit {fb:.2f}, rigid path", 6.0, fb, INF), (f"decay 3-12, fit {fb:.2f}, rigid path", 3.0, fb, INF),
                     ("decay 6-12, 0.47, no path (milestone 17 fit)", 6.0, 0.47, 0.0),
                     ("decay 6-12, NDS, rigid path", 6.0, 1.0, INF)):
    c, sh, sl, tot = mech(e, f, s)
    MECH[lab] = {"cap": c, "share": sh, "slide": sl, "nail_work": tot}
    print(f"{lab:46s} cap {c:6.2f}, sheathing nails {tot:6.2f}: " + ", ".join(f"{k} {v:.0%}" for k, v in sh.items())
          + " | stud slides " + " ".join(f"{v:+.2f}" for v in sl))
h85 = bool(MECH[f"decay 6-12, fit {fb:.2f}, rigid path"]["share"]["end studs"] >= 0.5)
print(f"H85 (end studs carry at least half at the fit, 6-12): {'held' if h85 else 'refuted'}\n")
out["E"] = MECH

# ------------------------------------------------------------------ F. H86 threshold
print("## F. H86: how strong a shear path stops the slide at milestone 17's fit (0.47 x NDS), decay 6-12")
TH = {}
srange = [round(x, 2) for x in np.arange(0.0, 30.01, 0.25)]
thr = None
for s in srange:
    c, _, sl, _ = mech(6.0, 0.47, s)
    TH[str(s)] = {"cap": c, "end_slide": max(abs(sl[0]), abs(sl[-1]))}
    if thr is None and TH[str(s)]["end_slide"] < 0.5:
        thr = s
for s in (0.0, 1.0, 2.0, 3.0, 4.0, 6.0, 8.0, 12.0, 20.0, 30.0):
    ci = cap((6.0, False, 0.47, s))
    print(f"s {s:5.2f} F: cap {TH[str(s)]['cap']:6.2f}, keeps {TH[str(s)]['cap'] / ci:.1%} of the intact wall at the "
          f"same s, end studs slide {TH[str(s)]['end_slide']:.2f}")
h86 = bool(thr is not None and thr <= SROD)
print(f"slide stops (end studs below half the top plate's slide) at s = {thr} F = "
      f"{thr * np.mean(list(F_LB.values())):.0f} lb a rod; NDS design value of the rod path {SROD:.2f} F ({ZROD:.0f} lb)"
      if thr is not None else "slide never stops in the range")
print(f"H86: {'held' if h86 else 'refuted'}")
# post hoc: the strongest shear path at which some joint multiple (0.05-1.50 by 0.05) still fits within 5 points
SW = [round(x, 2) for x in np.arange(0.0, 4.01, 0.25)]
jobs2 = [(e, d, f, s) for s in SW for f in FS for e in (6.0, 3.0) for d in (False, True)]
with mp.Pool(4) as pool:
    C.update(zip(jobs2, pool.map(cap, jobs2, chunksize=8)))
WIN = {}
for s in SW:
    fbs = min(FS, key=lambda f: rms(f, s))
    WIN[str(s)] = {"fit": fbs, "rms": rms(fbs, s), "ratio": ratio(fbs, s)}
smax = max([s for s in SW if WIN[str(s)]["rms"] <= 0.05], default=None)
print("post hoc, best joint multiple by shear path: " + "; ".join(
    f"s {s:g}: {WIN[str(s)]['fit']:.2f}, rms {WIN[str(s)]['rms']:.1%}" for s in SW))
print(f"strongest shear path with a fit within 5 points: s = {smax} F = "
      f"{smax * np.mean(list(F_LB.values())):.0f} lb a rod (NDS design value {ZROD:.0f}-{max(v[0] for v in ROD.values()):.0f} lb)\n")
out["F"] = {"threshold_F": thr, "sweep": TH, "window": WIN, "s_max_fit": smax}

# ------------------------------------------------------------------ G. escaped misses at the new fit
print("## G. Escaped misses (milestone 17's H80) at the new fit, rigid shear path, first 2,000 walls")
NW = 2000
D_ = json.load(open(os.path.join(HERE, "..", "m11_measured", "profiles.json")))
m6b = json.load(open(os.path.join(HERE, "..", "m6b_bowed_edge", "results.json")))
ROCK = np.radians(np.array(m6b["F_draws"]["drake_deg"]))
MEAS = M.model_profiles(D_["members"], "smooth", STUD_LEN)
N = 20000
r3 = Q.clean(framing="2x", policy="three", rock_draw=ROCK, profiles=MEAS, warp="straight", trials=N, seed=7, hits=True)
H3 = np.asarray(r3["hits"], bool)
pairs = np.hstack([H3[: N // 2], H3[N // 2:]])[:NW]
upairs, inv = np.unique(pairs, axis=0, return_inverse=True)


def _solve(args):
    mask, f, s = args
    return WL[6.0].capacity(mask, lat=f * LAT, omega=0.0, top="norot", hd_shear=s)


G = {}
with mp.Pool(4) as pool:
    for lab, f, s in (("milestone 17 model, NDS joints", 1.0, 0.0), (f"rigid path, {fb:.2f} x NDS", fb, INF)):
        ci = WL[6.0].capacity(lat=f * LAT, omega=0.0, top="norot", hd_shear=s)
        v = np.array(pool.map(_solve, [(p, f, s) for p in upairs], chunksize=16))
        cp = v[inv.ravel()] / ci
        G[lab] = {"mean_loss": float(1 - cp.mean()), "p99_loss": float(1 - np.percentile(cp, 1)), "min": float(cp.min())}
        print(f"{lab:36s}: {len(upairs)} distinct walls; mean loss {1 - cp.mean():.2%}, 99th-percentile loss "
              f"{1 - np.percentile(cp, 1):.2%}, min {cp.min():.4f}")
print(f"milestone 17 (10,000 walls, NDS joints): mean {M17['G']['registered (NDS joints)']['mean_loss']:.2%}, "
      f"p99 {M17['G']['registered (NDS joints)']['p99_loss']:.2%}\n")
out["G"] = G

out["hypotheses"] = {"H81": h81, "H82": h82, "H83": h83, "H84": h84, "H85": h85, "H86": h86}
out["seconds"] = time.time() - T0
json.dump(out, open(os.path.join(HERE, "results.json"), "w"), indent=1, default=float)
print(f"{time.time() - T0:.1f} s")
