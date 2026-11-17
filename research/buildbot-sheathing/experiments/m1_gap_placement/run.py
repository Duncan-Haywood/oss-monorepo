"""Milestone 1: the panel gap, the sheet's pose and row drift in the joint-nail budget.

    python experiments/m1_gap_placement/run.py > experiments/m1_gap_placement/results.txt

Writes results.json beside this file. Fixed seeds; about a minute on one CPU.
"""
import json
import math
import os
import platform
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from buildbot_sheathing import budget as B  # noqa: E402

MM = 1e-3
DEG = math.pi / 180
ROBOT = 0.9 * MM            # buildbot-fasten: G1 tip scatter with 11-bit joint sensors
STUD = 0.5 * MM             # a stud estimate inside studfind's 0.89 mm budget
T = 20000
out = {"versions": {"python": platform.python_version(), "numpy": np.__version__}}


def mm(v):
    return round(v / MM, 3)


print("# Milestone 1: panel gap, sheet pose and row drift (buildbot-sheathing)")
print(f"robot tip scatter {ROBOT/MM} mm per nail; trials {T} per cell; seed 1 (sheets), 2 (rows)\n")

# A. the gap and the window
print("## A. Joint window and stud budget against the gap (perfect placement, nominal aim)")
print("gap_in  joint_half_mm  stud_sigma_95_mm  tip_sigma_95_mm(perfect studs)")
rows = []
for g_in in (0.0, 1 / 32, 1 / 16, 3 / 32, 1 / 8, 3 / 16):
    g = g_in * B.IN
    s_stud = B.largest("s_stud", trials=T, design_gap=g, s_robot=ROBOT)
    s_tip = B.largest("s_robot", trials=T, design_gap=g)
    rows.append({"gap_in": g_in, "half_mm": mm(B.joint_half(g)), "stud95_mm": mm(s_stud), "tip95_mm": mm(s_tip)})
    print(f"{g_in:6.4f}  {mm(B.joint_half(g)):13.3f}  {mm(s_stud):16.3f}  {mm(s_tip):8.3f}")
out["A"] = rows
p0 = B.success(trials=T, design_gap=0.0, s_stud=0.89 * MM, s_robot=ROBOT)
p1 = B.success(trials=T, design_gap=B.GAP, s_stud=0.89 * MM, s_robot=ROBOT)
p2, miss2, _ = B.simulate_sheet(trials=T, design_gap=0.0, offset=B.GAP / 2, width=B.MODULE - B.GAP,
                                s_stud=0.89 * MM, s_robot=ROBOT)
print(f"studfind's 0.89 mm budget: clean sheets {p0:.3f} without the gap, {p1:.3f} with a 1/8 in gap the robot plans for,"
      f" {p2:.3f} ({miss2*62:.1f} nails missed a sheet) if the robot aims for no gap but the sheet is hung with one")
out["A_studfind_budget"] = {"no_gap": p0, "gap_planned": p1, "gap_unplanned": p2, "gap_unplanned_missed_nails": miss2 * 62}
print()

# B. sheet pose
res_b = {}
for s_stud_b in (STUD, 0.3 * MM):   # 0.5 mm pre-registered; 0.3 mm added after 0.5 mm failed 95% with no pose error
  print(f"## B. Sheet pose tolerance (1/8 in gap, stud {s_stud_b/MM} mm, tip {ROBOT/MM} mm)")
  base = dict(trials=T, design_gap=B.GAP, s_stud=s_stud_b, s_robot=ROBOT)
  res_b[f"stud {s_stud_b/MM} mm"] = {}
  for pol, kw in (("nominal", {}), ("edge 0.25 mm", {"policy": "edge", "s_edge": 0.25 * MM}),
                  ("edge 0.5 mm", {"policy": "edge", "s_edge": 0.5 * MM}), ("edge 1 mm", {"policy": "edge", "s_edge": 1.0 * MM})):
      sx = B.largest("s_x", hi=0.03, **base, **kw)
      st = B.largest("s_theta", hi=2 * DEG, **base, **kw)
      res_b[f"stud {s_stud_b/MM} mm"][pol] = {"s_x95_mm": mm(sx), "s_theta95_deg": round(st / DEG, 4),
                    "edge_offset_at_top_mm": mm(st * (B.HEIGHT / 2 - B.EDGE))}
      print(f"{pol:13s}  translation sigma for 95%: {mm(sx):6.2f} mm   rotation sigma for 95%: {st/DEG:7.4f} deg"
            f" (= {mm(st*(B.HEIGHT/2-B.EDGE)):.2f} mm at the top nail)")
out["B"] = res_b
base = dict(trials=T, design_gap=B.GAP, s_stud=STUD, s_robot=ROBOT)
print(f"clean sheets against rotation sigma (deg), stud {STUD/MM} mm:")
grid = [0.0, 0.02, 0.05, 0.1, 0.2, 0.5, 1.0]
tab = {}
for pol, kw in (("nominal", {}), ("edge 0.5 mm", {"policy": "edge", "s_edge": 0.5 * MM})):
    ps = [B.success(**base, **kw, s_theta=d * DEG) for d in grid]
    tab[pol] = ps
    print(f"  {pol:12s} " + "  ".join(f"{d:g}:{p:.3f}" for d, p in zip(grid, ps)))
out["B_rotation_grid"] = {"deg": grid, **tab}
print(f"clean sheets against translation sigma (mm), stud {STUD/MM} mm:")
gx = [0.0, 0.5, 1, 2, 3, 5, 8]
tab = {}
for pol, kw in (("nominal", {}), ("edge 0.5 mm", {"policy": "edge", "s_edge": 0.5 * MM})):
    ps = [B.success(**base, **kw, s_x=v * MM) for v in gx]
    tab[pol] = ps
    print(f"  {pol:12s} " + "  ".join(f"{v:g}:{p:.3f}" for v, p in zip(gx, ps)))
out["B_translation_grid"] = {"mm": gx, **tab}
print()

# C. rows
print("## C. A 10-sheet row (40 ft wall): share of trials with every joint window non-empty / clean sheet, by sheet")
print("   (gap set by a 1/8 in gauge with 0.5 mm scatter; width scatter 0.5 mm; stud 0.5 mm, tip 0.9 mm, edge aim 0.5 mm)")
res_c = {}
common = dict(n_sheets=10, trials=4000, s_gap=0.5 * MM, s_width=0.5 * MM, s_stud=STUD, s_robot=ROBOT)
for name, kw in (
        ("butt, full 48 in, nominal aim", dict(placement="butt", width=B.MODULE)),
        ("butt, full 48 in, edge aim", dict(placement="butt", width=B.MODULE, policy="edge", s_edge=0.5 * MM)),
        ("butt, 1/16 trim, edge aim", dict(placement="butt", width=B.MODULE - B.IN / 16, policy="edge", s_edge=0.5 * MM)),
        ("butt, 1/8 trim, edge aim", dict(placement="butt", width=B.MODULE - B.GAP, policy="edge", s_edge=0.5 * MM)),
        ("stud, 1/16 trim, edge aim", dict(placement="stud", width=B.MODULE - B.IN / 16, policy="edge", s_edge=0.5 * MM)),
        ("stud, 1/8 trim, edge aim", dict(placement="stud", width=B.MODULE - B.GAP, policy="edge", s_edge=0.5 * MM)),
):
    r = B.simulate_row(**common, **kw)
    last_ok = max([k + 1 for k, f in enumerate(r["feasible"]) if f >= 0.5] or [0])
    r["sheets_feasible_majority"] = last_ok
    res_c[name] = r
    print(f"{name:30s} feasible " + " ".join(f"{f:.2f}" for f in r["feasible"]))
    print(f"{'':30s} clean    " + " ".join(f"{p:.2f}" for p in r["clean"]) +
          f"   (last sheet feasible in >=50%: {last_ok})")
    if "gap_min" in r:
        print(f"{'':30s} realised gap < 0 at {r['gap_p_below_zero']*100:.1f}% of joints")
out["C"] = res_c
# H5 at the pre-registered width scatter (1 mm)
r5 = B.simulate_row(n_sheets=10, trials=4000, placement="stud", width=B.MODULE - B.IN / 16, s_width=1.0 * MM,
                    s_stud=STUD, s_robot=ROBOT, policy="edge", s_edge=0.5 * MM)
out["H5"] = {"gap_p_below_zero": r5["gap_p_below_zero"], "feasible_min": min(r5["feasible"])}
print(f"stud-referenced, 1/16 in trim, width scatter 1 mm: realised gap < 0 at {r5['gap_p_below_zero']*100:.1f}% of joints,"
      f" every joint feasible in >= {min(r5['feasible']):.3f} of trials")

with open(os.path.join(HERE, "results.json"), "w") as f:
    json.dump(out, f, indent=1)
