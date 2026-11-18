"""Milestone 11: the first measured studs, from a laser scan of a robot-built 2x4 wall.

    python experiments/m11_measured/extract.py      # once: fetch the data set, write profiles.json
    python experiments/m11_measured/run.py > experiments/m11_measured/results.txt

Reads profiles.json (committed) and ../m6b_bowed_edge/results.json (the smooth-bow seats); writes
results.json beside this file. Hypotheses H49-H52 were registered in LOG.md before any stud
profile was extracted. About a minute on one CPU.

Data: Ruan, D. (2024). Adaptive Multi-Robot Timber Construction Dataset. Princeton University.
doi:10.34770/0w80-p436, CC BY 4.0 (Adel, Ruan, McGee and Mozaffari 2024, Automation in
Construction 164, 105444).
"""
import json
import math
import os
import platform
import sys
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from buildbot_sheathing import cycle as C  # noqa: E402
from buildbot_sheathing import measured as M  # noqa: E402
from buildbot_sheathing import tack as K  # noqa: E402
from buildbot_sheathing.asbuilt import STUD_LEN  # noqa: E402

T0 = time.time()
MM = 1e-3
IN_MM = 25.4
FT8_MM = 96 * IN_MM
N = 20000
SMOOTH = 11                      # slices (110 mm) in the running mean used for the pipeline
D = json.load(open(os.path.join(HERE, "profiles.json")))
m6b = json.load(open(os.path.join(HERE, "..", "m6b_bowed_edge", "results.json")))
ROCK = np.radians(np.array(m6b["F_draws"]["drake_deg"]))
out = {"versions": {"python": platform.python_version(), "numpy": np.__version__}, "trials": N, "seed": 7,
       "source": D["source"]}

vert = [m for m in D["members"] if m["kind"] == "vertical"]
incl = [m for m in D["members"] if m["kind"] == "inclined"]


def s_of(m):
    v = np.array(m["v"])
    return (v - v[0]) / (v[-1] - v[0]), float(v[-1] - v[0])


def smooth(x, k=SMOOTH):
    x = np.asarray(x, float)
    pad = np.r_[np.full(k // 2, x[0]), x, np.full(k // 2, x[-1])]
    return np.convolve(pad, np.ones(k) / k, mode="valid")


print("# Milestone 11: measured studs from a scanned robot-built 2x4 wall (buildbot-sheathing)")
print(f"data: Adel et al. 2024 wall module scan, doi:{D['source']['doi']} ({D['source']['license']}), "
      f"{D['source']['points']:,} points; wall plane inlier sd {D['plane']['inlier_sd_mm']:.2f} mm; "
      f"studs between v = {D['plates_mm'][0]:.0f} and {D['plates_mm'][1]:.0f} mm; "
      f"{len(vert)} vertical studs, {len(incl)} inclined members; slices {M.DV:.0f} mm\n")

# ------------------------------------------------------------------ A. calibration
print("## A. The extractor on synthetic faces of known bow (2 mm profile pitch, 3.2 mm eased corners, 8 grid phases)")
cal = M.calibrate(bows=(0.0, 1.0, 3.0, 6.0), phases=8)
print("true bow mm | recovered mean, sd | parabola R^2 median | RMS residual median mm | face width median mm")
for r in cal:
    rec = np.array(r["recovered"])
    print(f"{r['bow']:4.1f} | {rec.mean():5.2f}, {rec.std(ddof=1):4.2f} | {np.median(r['r2']):5.2f} | "
          f"{np.median(r['rms_res']):4.2f} | {np.median(r['width']):4.1f}")
cal_err = float(np.sqrt(np.mean([(x - r["bow"]) ** 2 for r in cal for x in r["recovered"]])))
cal_res = float(np.median([x for r in cal for x in r["rms_res"]]))
cal_w = float(np.median([x for r in cal for x in r["width"]]))
print(f"bow recovered to {cal_err:.2f} mm RMS; a perfect parabola still leaves {cal_res:.2f} mm RMS of "
      f"quantisation (edges fall between profiles 2 mm apart)\n")
out["A"] = {"rows": cal, "bow_rms_err_mm": cal_err, "res_floor_mm": cal_res, "width_flat_mm": cal_w}

# ------------------------------------------------------------------ B. H49
print("## B. H49: does the scan resolve a stud face?")
h49 = True
rowsB = []
for m in vert:
    w_all = float(np.median(m["width_all"]))
    w_flat = float(np.median(m["width"]))
    big, sd = M.steps(m["centre"])
    ok = abs(w_all - M.FACE_MM) <= 2.0 and big <= 0.3 + 3 * sd
    h49 &= ok
    rowsB.append({"u": m["u_mid"], "width_all": w_all, "width_flat": w_flat, "max_step": big, "step_sd": sd})
    print(f"stud at u {m['u_mid']:7.0f}: width {w_all:4.1f} mm (all front points), {w_flat:4.1f} (flat face); "
          f"largest slice-to-slice jump {big:4.2f} mm against a robust sd of {sd:4.2f}")
print(f"bar: width {M.FACE_MM} +- 2 mm and no jump over 0.3 mm + 3 sd")
print(f"H49 -> {'held' if h49 else 'refuted'}; the synthetic 38.1 mm face reads {cal_w:.1f} mm on its flat part\n")
out["B"] = {"rows": rowsB, "H49": h49}

# ------------------------------------------------------------------ C. per-stud shape
print("## C. The six vertical studs: flatwise bow, shape, twist and out-of-plane shape")
print("u mm | length mm | bow mm | bow at 8 ft in | parabola R^2 | RMS resid mm | max |dev| mm | "
      "twist end-to-end deg | twist RMS about line deg | out-of-plane range mm")
rowsC = []
for m in vert:
    s, L = s_of(m)
    f = M.chord_fit(s, m["centre"])
    phi = np.degrees(np.arctan(np.array(m["slope"])))
    tl = np.polyfit(s, phi, 1)
    t_res = float(np.sqrt(np.mean((phi - np.polyval(tl, s)) ** 2)))
    w = np.array(m["w"])
    fw = M.chord_fit(s, w)
    b8 = f["bow"] * (FT8_MM / L) ** 2 / IN_MM
    r = {"u": m["u_mid"], "L": L, "bow_mm": f["bow"], "bow_8ft_in": b8, "r2": f["r2"], "rms_res": f["rms_res"],
         "max_dev": f["max_dev"], "twist_deg": float(tl[0]), "twist_mean_deg": float(phi.mean()),
         "twist_res_deg": t_res, "w_range": float(w.max() - w.min()), "w_bow": fw["bow"],
         "w_lean": float(fw["line"][1]), "lean": float(f["line"][1])}
    rowsC.append(r)
    print(f"{m['u_mid']:7.0f} | {L:5.0f} | {f['bow']:5.2f} | {b8:6.3f} | {f['r2']:4.2f} | {f['rms_res']:4.2f} | "
          f"{f['max_dev']:4.2f} | {tl[0]:5.2f} | {t_res:4.2f} | {w.max() - w.min():5.1f}")
ab8 = np.abs([r["bow_8ft_in"] for r in rowsC])
h50 = bool(np.all(ab8 < 0.75) and np.median(ab8) <= 0.21)
print(f"median |bow| at 8 ft {np.median(ab8):.3f} in, largest {ab8.max():.3f} in; published means 0.11 (low), "
      f"0.21 (high), Stud-grade limit 0.75")
print(f"H50 -> {'held' if h50 else 'refuted'}")
cand = [r for r in rowsC if abs(r["bow_mm"]) > 1.0]
h51 = all(r["r2"] >= 0.8 and r["rms_res"] <= 0.5 for r in cand)
print(f"H51 (studs with |bow| > 1 mm: {len(cand)}): R^2 {[round(r['r2'], 2) for r in cand]}, RMS residual "
      f"{[round(r['rms_res'], 2) for r in cand]} mm (bar R^2 >= 0.8, residual <= 0.5 mm)")
excess = [math.sqrt(max(r["rms_res"] ** 2 - cal_res ** 2, 0.0)) for r in rowsC]
print(f"H51 -> {'held' if h51 else 'refuted'}; RMS residual beyond the {cal_res:.2f} mm quantisation floor: "
      f"{[round(x, 2) for x in excess]} mm")
# a smooth (110 mm) residual is the shape the parabola misses that a nail would see
sm_res = []
for m in vert:
    s, L = s_of(m)
    f = M.chord_fit(s, smooth(m["centre"]))
    sm_res.append(f["rms_res"])
print(f"after a {SMOOTH * M.DV:.0f} mm running mean the residual is {[round(x, 2) for x in sm_res]} mm\n")
out["C"] = {"rows": rowsC, "H50": h50, "H51": h51, "excess_res_mm": excess, "smooth_res_mm": sm_res}


def par_res(m, ang=0.0):
    """Smoothed centreline minus its own chord-plus-parabola fit (mm), on the member's slices."""
    s, _ = s_of(m)
    c = smooth(np.array(m["centre"]) * math.cos(ang))
    A = np.c_[np.ones_like(s), s, 4 * s * (1 - s)]
    return c - A @ np.linalg.lstsq(A, c, rcond=None)[0]


# Post hoc (not registered): is the shape the parabola misses wood, or the scan? Every member is
# sliced at the same heights, and the scan is stitched from passes that each cover a band of
# heights across the whole wall; a pass registered a little off moves every member in that band
# the same way, while wood waviness is independent from member to member.
ANG = [math.atan((m["u_top"] - m["u_bot"]) / s_of(m)[1]) for m in incl]
RES = np.array([par_res(m) for m in vert] + [par_res(m, a) for m, a in zip(incl, ANG)])
CM = RES.mean(axis=0)
cc = np.corrcoef(RES)
pair = cc[np.triu_indices(len(RES), 1)]
frac_cm = 1 - float(((RES - CM) ** 2).mean() / (RES ** 2).mean())
print("Post hoc: the residual shape across all eleven members (110 mm mean, after each member's parabola)")
print(f"pairwise correlation of the residuals: median {np.median(pair):.2f} (range {pair.min():.2f} to {pair.max():.2f}); "
      f"the across-member mean carries {frac_cm:.0%} of the residual variance, against "
      f"{1 / len(RES):.0%} if the members were independent")
rc = np.sqrt(((RES - CM) ** 2).mean(axis=1))
print(f"RMS residual with the common part removed: {np.round(rc[:len(vert)], 2).tolist()} mm (vertical studs), "
      f"common part's RMS {np.sqrt((CM ** 2).mean()):.2f} mm\n")
out["C"]["common"] = {"pair_median": float(np.median(pair)), "frac": frac_cm, "rms_after": rc.tolist(),
                      "rms_common": float(np.sqrt((CM ** 2).mean()))}

# lean and layout
u_bot = np.array([np.polyval(np.polyfit(*s_of(m)[:1], m["centre"], 1), 0.0) for m in vert])
u_top = np.array([np.polyval(np.polyfit(*s_of(m)[:1], m["centre"], 1), 1.0) for m in vert])
k = np.arange(len(vert))
for name, uu in (("bottom", u_bot), ("top", u_top)):
    p = np.polyfit(k, uu, 1)
    res = uu - np.polyval(p, k)
    print(f"layout at the {name}: spacing {p[0]:.1f} mm (16 in = 406.4); residuals {np.round(res, 1).tolist()} mm, "
          f"sd {res.std(ddof=2):.1f}")
    out["C"][f"layout_{name}"] = {"spacing": float(p[0]), "res": res.tolist(), "sd": float(res.std(ddof=2))}
lean = u_top - u_bot
print(f"lean (top minus bottom of each stud's chord): {np.round(lean, 1).tolist()} mm; about their median: "
      f"{np.round(lean - np.median(lean), 1).tolist()} mm\n")
out["C"]["lean_mm"] = lean.tolist()

# ------------------------------------------------------------------ D. inclined members
print("## D. The five inclined members, in-plane bow about their own chords (horizontal slices, x cos)")
rowsD = []
for m in incl:
    s, L = s_of(m)
    ang = math.atan((m["u_top"] - m["u_bot"]) / L)
    f = M.chord_fit(s, np.array(m["centre"]) * math.cos(ang))
    Lm = L / math.cos(ang)
    b8 = f["bow"] * (FT8_MM / Lm) ** 2 / IN_MM
    rowsD.append({"u": m["u_mid"], "angle_deg": math.degrees(ang), "bow_mm": f["bow"], "bow_8ft_in": b8,
                  "r2": f["r2"], "rms_res": f["rms_res"]})
    print(f"u {m['u_mid']:7.0f}: {math.degrees(ang):4.1f} deg off vertical, bow {f['bow']:5.2f} mm "
          f"({b8:6.3f} in at 8 ft), R^2 {f['r2']:4.2f}, RMS residual {f['rms_res']:4.2f} mm")
all8 = np.abs([r["bow_8ft_in"] for r in rowsC + rowsD])
print(f"all eleven members: median |bow| at 8 ft {np.median(all8):.3f} in, mean {all8.mean():.3f}, largest {all8.max():.3f}\n")
out["D"] = {"rows": rowsD, "median_all_8ft_in": float(np.median(all8)), "mean_all_8ft_in": float(all8.mean())}

# ------------------------------------------------------------------ E. pipeline
print("## E. H52: milestone 9's best single-2x ledger pipeline on the measured studs")
print(f"three stud reads, s_x 1 mm, edge aim, tool {C.S_ROBOT / MM:.1f} mm, smooth-rock seats (Drake), "
      f"{N:,} sheets, seed 7; each stud drawn from the six with random flips; deviation scaled to the "
      f"{STUD_LEN / MM:.0f} mm stud by length squared")
g = np.linspace(0, 1, 201)


def profiles(kind):
    Ds, Ps = [], []
    for m in vert:
        s, L = s_of(m)
        c = np.array(m["centre"])
        phi = np.arctan(np.array(m["slope"]))
        if kind == "raw":
            dev = M.chord_fit(s, c)["dev"]
        elif kind == "smooth":
            dev = M.chord_fit(s, smooth(c))["dev"]
            phi = smooth(phi)
        elif kind == "parabola":
            f = M.chord_fit(s, c)
            dev = 4 * f["bow"] * s * (1 - s)
            phi = np.polyval(np.polyfit(s, phi, 1), s)
        elif kind == "common removed":
            sm = smooth(c)
            A = np.c_[np.ones_like(s), s, 4 * s * (1 - s)]
            dev = M.chord_fit(s, sm - CM)["dev"]
            phi = smooth(phi)
        elif kind == "no twist":
            dev = M.chord_fit(s, smooth(c))["dev"]
            phi = np.zeros_like(s)
        else:
            raise ValueError(kind)
        _, d = M.to_model(s, dev, STUD_LEN, L, n=len(g))
        Ds.append(d)
        Ps.append(np.interp(g, s, phi))
    return g, np.array(Ds), np.array(Ps)


def run(framing, policy="three", prof=None, warp=None):
    kw = dict(trials=N, seed=7, policy=policy, band=C.band(), joint_band=C.band(C.FRAMING[framing]),
              s_robot=C.tool_scatter("none"), s_read=0.5 * MM, s_edge=0.5 * MM, s_x=1.0 * MM, aim="edge",
              theta_draw=C.ledger_draw(0.5 * MM, 1.0, None, ROCK), profiles=prof)
    if warp is not None:
        kw.update(C.WARP[warp])
    return K.simulate(**kw)


rowsE = {}
for framing in ("2x", "2x2x"):
    for policy in ("three", "dense"):
        cells = {"measured (110 mm mean)": profiles("smooth"), "measured (raw slices)": profiles("raw"),
                 "measured, common part removed": profiles("common removed"),
                 "parabola at each stud's own bow": profiles("parabola"), "measured, no twist": profiles("no twist")}
        for name, prof in cells.items():
            r = run(framing, policy, prof)
            lo, hi = C.wilson(r["clean"], N)
            rowsE[f"{framing}|{policy}|{name}"] = r
            print(f"{framing:5s} {policy:5s} {name:32s} clean {r['clean']:.4f} [{lo:.4f}, {hi:.4f}], "
                  f"missed {r['missed']:.3f} a sheet")
        for warp in ("straight", "low"):
            r = run(framing, policy, None, warp)
            rowsE[f"{framing}|{policy}|model {warp}"] = r
            print(f"{framing:5s} {policy:5s} {'model, ' + warp + ' studs':32s} clean {r['clean']:.4f}, missed {r['missed']:.3f}")
gap1 = abs(rowsE["2x|three|measured (110 mm mean)"]["clean"] - rowsE["2x|three|parabola at each stud's own bow"]["clean"])
gap2 = abs(rowsE["2x2x|three|measured (110 mm mean)"]["clean"] - rowsE["2x2x|three|parabola at each stud's own bow"]["clean"])
dbl = rowsE["2x2x|three|measured (110 mm mean)"]["clean"]
h52 = gap1 <= 0.05 and gap2 <= 0.05 and dbl >= 0.99
print(f"|measured - parabola|: single 2x {gap1:.4f}, doubled {gap2:.4f} (bar 0.05); doubled on measured {dbl:.4f} (bar 0.99)")
print(f"H52 -> {'held' if h52 else 'refuted'}\n")
out["E"] = {"rows": rowsE, "gap_2x": gap1, "gap_2x2x": gap2, "H52": h52}

# ------------------------------------------------------------------ F. robot placement scatter
print("## F. The same data set's nail-laminated panel: an industrial robot placing ten 2x4s")
out["F"] = {}
TABLE1 = {"BenchmarkPose": [0.4487, 2.5809, 0.1041, 2.2754, 0.1805, 1.9811, 0.7214, 1.5424, 0.4354, 2.5502],
          "AdaptivePose": [0.2595, 0.2317, 0.4119, 1.0836, 0.3855, 0.4314, 0.2859, 0.1844, 0.6550, 0.0819]}
for name, rows in D["pose"].items():
    a = np.array(rows)
    xy = np.hypot(a[:, 0], a[:, 1])
    odd, even = a[0::2], a[1::2]
    tbl = TABLE1.get(name)
    if tbl is not None:
        match = np.allclose(np.round(xy, 4), tbl, atol=2e-4)
        print(f"{name}: per-element in-plane distances {'reproduce' if match else 'do not reproduce'} the paper's "
              f"Table 1 (mean {np.mean(tbl):.4f} mm there, {xy.mean():.4f} here)")
        out["F"][name + "_matches_table1"] = bool(match)
    print(f"{name}: in-plane distance mean {xy.mean():.2f} mm, sd {xy.std(ddof=1):.2f}; x sd {a[:, 0].std(ddof=1):.2f}, "
          f"y sd {a[:, 1].std(ddof=1):.2f} mm (per robot: y sd {odd[:, 1].std(ddof=1):.2f} and {even[:, 1].std(ddof=1):.2f}); "
          f"yaw mean {np.degrees(a[:, 3]).mean():.2f} deg, sd {np.degrees(a[:, 3]).std(ddof=1):.2f}")
    out["F"][name] = {"xy_mean": float(xy.mean()), "xy_sd": float(xy.std(ddof=1)),
                      "x_sd": float(a[:, 0].std(ddof=1)), "y_sd": float(a[:, 1].std(ddof=1)),
                      "y_sd_robots": [float(odd[:, 1].std(ddof=1)), float(even[:, 1].std(ddof=1))]}
print("(these are element poses from the robot's own profile scans, not nail positions)\n")

out["seconds"] = time.time() - T0
json.dump(out, open(os.path.join(HERE, "results.json"), "w"), indent=1, default=float)
print(f"wall time {out['seconds']:.0f} s")
