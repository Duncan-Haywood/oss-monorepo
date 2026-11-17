"""Milestone 2: as-built studs (bow, twist, lean) under a straight sheet edge.

    python experiments/m2_asbuilt_studs/run.py > experiments/m2_asbuilt_studs/results.txt

Writes results.json beside this file. Fixed seeds (3 for sheets); a minute or two on one CPU.
"""
import json
import math
import os
import platform
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from buildbot_sheathing import asbuilt as A  # noqa: E402
from buildbot_sheathing import budget as B  # noqa: E402

MM = 1e-3
IN = B.IN
T = 20000
BAND10 = A.Band(p_req=10 * A.D_NAIL)
BAND6 = A.Band(p_req=6 * A.D_NAIL)
# published means of kiln-dried 2x4 studs (8 ft), inches: bow, twist (README input table)
WARP = {"none": (0.0, 0.0), "low (0.11, 0.08 in)": (0.11, 0.08), "high (0.21, 0.16 in)": (0.21, 0.16)}
LOW = dict(bow_mean=0.11 * IN, twist_mean=0.08 * IN)
out = {"versions": {"python": platform.python_version(), "numpy": np.__version__},
       "trials": T, "seed": 3}


def mm(v):
    return round(v / MM, 3)


def run(**kw):
    kw.setdefault("band", BAND10)
    p, miss, feas = A.simulate(trials=T, **kw)
    return {"clean": round(p, 4), "nails_missed": round(miss * B.N_NAILS, 3), "feasible": round(feas, 4)}


print("# Milestone 2: as-built studs under a straight sheet edge (buildbot-sheathing)")
print(f"tool 0.9 mm, stud read 0.5 mm per read, edge line 0.5 mm, 1/8 in gap; {T} sheets a cell, seed 3\n")

# A. geometry
print("## A. Geometry")
h = B.joint_half(B.GAP)
lim_w = A.to_wall_bow(A.BOW_LIMIT)
mm_minimax, mm_plates = A.max_feasible_bow(), A.max_feasible_bow(reference="plates")
scale = (A.STUD_LEN / A.GRADE_LEN) ** 2
print(f"joint half-window {mm(h)} mm; largest wall bow with a window on both sides of the joint:"
      f" {mm(mm_minimax)} mm (gap centred on the stud's range) = {mm_minimax/scale/IN:.3f} in over 8 ft;"
      f" {mm(mm_plates)} mm (centred on the plate line) = {mm_plates/scale/IN:.3f} in over 8 ft")
print(f"Stud-grade bow limit 0.75 in over 8 ft = {mm(lim_w)} mm on the 92 5/8 in stud;"
      f" twist limit 0.375 in = {math.degrees(A.to_wall_twist_angle(A.TWIST_LIMIT)):.2f} deg end to end")
cull = {}
for name, (bm, _) in WARP.items():
    if bm == 0:
        continue
    for shape in ("halfnormal", "exponential"):
        cull[f"{name} {shape}"] = {
            "beyond_minimax": round(A.cull_share(bm * IN, mm_minimax / scale, shape), 4),
            "beyond_plates": round(A.cull_share(bm * IN, mm_plates / scale, shape), 4)}
        print(f"  studs whose bow closes a joint, {name}, {shape}: {cull[f'{name} {shape}']['beyond_minimax']:.4f}"
              f" (minimax), {cull[f'{name} {shape}']['beyond_plates']:.4f} (plate line)")
band_rows = []
print("twist_deg  band_lo_mm(10D)  band_hi_mm(10D)  width_mm(10D)  width_mm(6D)")
for d in (0, 0.5, 1, 2, 3, 4, 6):
    lo, hi = BAND10(math.radians(d))
    lo6, hi6 = BAND6(math.radians(d))
    band_rows.append({"deg": d, "lo10": mm(lo), "hi10": mm(hi), "w10": mm(hi - lo), "w6": mm(hi6 - lo6)})
    print(f"{d:9.1f}  {mm(lo):15.3f}  {mm(hi):15.3f}  {mm(hi-lo):13.3f}  {mm(hi6-lo6):12.3f}")
out["A"] = {"half_window_mm": mm(h), "max_bow_minimax_mm": mm(mm_minimax), "max_bow_plates_mm": mm(mm_plates),
            "max_bow_minimax_8ft_in": round(mm_minimax / scale / IN, 4),
            "max_bow_plates_8ft_in": round(mm_plates / scale / IN, 4),
            "bow_limit_wall_mm": mm(lim_w), "cull": cull, "band": band_rows}
print()

# B. H6: a stud at the grade limit
print("## B. H6: every stud at the Stud-grade bow limit (0.75 in), perfect sensing and tool")
b_rows = {}
for pol in A.POLICIES:
    b_rows[pol] = run(policy=pol, bow=A.BOW_LIMIT, s_read=0, s_edge=0, s_robot=0)
    print(f"{pol:7s} feasible {b_rows[pol]['feasible']:.4f}  clean {b_rows[pol]['clean']:.4f}")
out["B"] = b_rows
print()

# C. main table
print("## C. Clean sheets by sensing policy and published warp (truncated at the grade limits)")
print("warp                   shape        policy  clean   nails_missed  feasible")
c_rows = {}
for name, (bm, tm) in WARP.items():
    for shape in (("halfnormal",) if bm == 0 else ("halfnormal", "exponential")):
        for pol in A.POLICIES:
            r = run(policy=pol, bow_mean=bm * IN, twist_mean=tm * IN, shape=shape)
            c_rows[f"{name}|{shape}|{pol}"] = r
            print(f"{name:22s} {shape:12s} {pol:7s} {r['clean']:.4f}  {r['nails_missed']:12.3f}  {r['feasible']:.4f}")
out["C"] = c_rows
print()

# D. ablation at the low published warp
print("## D. Ablation at the low published warp (half-normal)")
d_rows = {}
for pol in ("single", "three", "dense"):
    for lab, kw in (("bow+twist", LOW), ("bow only", {"bow_mean": LOW["bow_mean"]}),
                    ("twist only", {"twist_mean": LOW["twist_mean"]}), ("neither", {}),
                    ("bow+twist, 6D penetration", {**LOW, "band": BAND6}),
                    ("bow+twist, perfect reads", {**LOW, "s_read": 0.0}),
                    ("bow+twist, perfect reads+edge", {**LOW, "s_read": 0.0, "s_edge": 0.0})):
        r = run(policy=pol, **kw)
        d_rows[f"{pol}|{lab}"] = r
        print(f"{pol:7s} {lab:30s} clean {r['clean']:.4f}  missed {r['nails_missed']:.3f}  feasible {r['feasible']:.4f}")
out["D"] = d_rows
print()

# E. read scatter allowed
print("## E. Stud read scatter (1 sigma per read) allowed for 95% clean sheets")
e_rows = {}
for name, kw in (("straight studs", {}), ("low warp", LOW)):
    for pol in A.POLICIES:
        s = A.largest("s_read", trials=T, policy=pol, band=BAND10, **kw)
        e_rows[f"{name}|{pol}"] = mm(s)
        print(f"{name:15s} {pol:7s} {mm(s):6.3f} mm" + ("  (95% not reached even with perfect reads)" if s == 0 else ""))
out["E"] = e_rows
print()

# F. culling: the framer rejects bowed studs
print("## F. Culling bowed studs (8 ft bow cut, low published warp, half-normal)")
f_rows = {}
for cut in (0.75, 0.5, 0.375, 0.25, 0.1875, 0.125, 0.0625):
    row = {"cull_share": round(A.cull_share(LOW["bow_mean"], cut * IN), 4)}
    for pol in ("single", "three", "dense"):
        row[pol] = run(policy=pol, bow_cut=cut * IN, **LOW)["clean"]
    f_rows[str(cut)] = row
    print(f"cut {cut:6.4f} in  culled {row['cull_share']:.3f}  clean: single {row['single']:.4f}"
          f"  three {row['three']:.4f}  dense {row['dense']:.4f}")
out["F"] = f_rows
print()

# G. plate layout lean
print("## G. Plate layout error at each stud end (lean), low published warp")
g_rows = {}
for s_lay in (0.0, 0.8, 1.6, 3.2):
    row = {pol: run(policy=pol, s_layout=s_lay * MM, **LOW)["clean"] for pol in A.POLICIES}
    g_rows[str(s_lay)] = row
    print(f"layout {s_lay:3.1f} mm  " + "  ".join(f"{k} {v:.4f}" for k, v in row.items()))
out["G"] = g_rows

print()

# H. wider framing at the joints (added after C-F: no sensing policy reached 95% on 2x joints)
print("## H. Joint framing: one 2x (1.5 in face), a 3x (2.5 in), two 2x fastened (3.0 in); SDPWS 4.3.7.1")
h_rows = {}
BANDS = {"2x (1.5 in)": None, "3x (2.5 in)": A.Band(face=2.5 * IN), "2 x 2x (3.0 in)": A.Band(face=3.0 * IN)}
for jname, jb in BANDS.items():
    face = (jb.face if jb else B.FACE)
    print(f"{jname}: largest wall bow with a joint window {mm(A.max_feasible_bow(face=face))} mm")
    for wname in ("low (0.11, 0.08 in)", "high (0.21, 0.16 in)"):
        bm, tm = WARP[wname]
        row = {}
        for pol in A.POLICIES:
            row[pol] = run(policy=pol, bow_mean=bm * IN, twist_mean=tm * IN, joint_band=jb)["clean"]
        h_rows[f"{jname}|{wname}"] = row
        print(f"  {wname:22s} " + "  ".join(f"{k} {v:.4f}" for k, v in row.items()))
for jname in ("3x (2.5 in)", "2 x 2x (3.0 in)"):
    for wname in ("low (0.11, 0.08 in)", "high (0.21, 0.16 in)"):
        bm, tm = WARP[wname]
        for shape in ("exponential",):
            row = {pol: run(policy=pol, bow_mean=bm * IN, twist_mean=tm * IN, shape=shape,
                            joint_band=BANDS[jname])["clean"] for pol in A.POLICIES}
            h_rows[f"{jname}|{wname}|{shape}"] = row
            print(f"  {jname} {wname} {shape}: " + "  ".join(f"{k} {v:.4f}" for k, v in row.items()))
out["H"] = h_rows

with open(os.path.join(HERE, "results.json"), "w") as f:
    json.dump(out, f, indent=1)
