"""Milestone 5: the whole cycle, in seconds per sheet and clean sheets.

    python experiments/m5_cycle/run.py > experiments/m5_cycle/results.txt

Writes results.json beside this file. Monte Carlo 20,000 sheets a cell, seed 7; under a minute.
"""
import itertools
import json
import math
import os
import platform
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from buildbot_sheathing import cycle as C  # noqa: E402

MM = 1e-3
T = 20000
FRAMINGS = ("2x", "2x2x")
POLICIES = ("single", "three", "dense")
PLACEMENTS = {"ledger, s_x 1 mm": dict(placement="ledger", s_x=1 * MM),
              "ledger, s_x 3 mm": dict(placement="ledger", s_x=3 * MM),
              "lift-tack 0.25 deg / 5 mm": dict(placement="lift-tack", s_x=5 * MM, s_theta=math.radians(0.25))}
WARPS = ("low", "high")
RECOILS = ("none", "nowait")
out = {"versions": {"python": platform.python_version(), "numpy": np.__version__}, "trials": T, "seed": 7}

print("# Milestone 5: the whole cycle (buildbot-sheathing)")
print(f"{T} sheets a cell, seed 7; edge aim, tacked; reads a sheet: single {C.reads_per_sheet('single')}, "
      f"three {C.reads_per_sheet('three')}, dense {C.reads_per_sheet('dense')} (3 new studs + 2 edges)")
print(f"tool scatter {C.S_ROBOT / MM:.2f} mm; no-wait recoil at 4 N s adds {C.RECOIL_RESIDUAL / MM:.2f} mm in "
      f"quadrature -> {C.tool_scatter('nowait') / MM:.3f} mm\n")

# A. clean sheets by pipeline
print("## A. First-pass clean sheets [95% Wilson] and missed nails a sheet")
print(f"{'framing':6s} {'placement':26s} {'warp':5s} {'recoil':7s} " +
      " ".join(f"{p:>27s}" for p in POLICIES))
A = {}
for fr, (pl, pkw), w, rc in itertools.product(FRAMINGS, PLACEMENTS.items(), WARPS, RECOILS):
    cells = []
    for p in POLICIES:
        r = C.clean_cell(framing=fr, policy=p, warp=w, recoil=rc, trials=T, seed=7, **pkw)
        r["ci"] = C.wilson(r["clean"], T)
        A[(fr, pl, w, rc, p)] = r
        cells.append(f"{r['clean']:.4f} [{r['ci'][0]:.3f},{r['ci'][1]:.3f}] {r['missed']:5.2f}")
    print(f"{fr:6s} {pl:26s} {w:5s} {rc:7s} " + " ".join(f"{c:>27s}" for c in cells))
out["A"] = [{"framing": k[0], "placement": k[1], "warp": k[2], "recoil": k[3], "policy": k[4], **v}
            for k, v in A.items()]
print()

BASE = "ledger, s_x 1 mm"
h22 = max(A[("2x", BASE, "low", "none", p)]["clean"] for p in POLICIES)
h23 = A[("2x2x", BASE, "low", "none", "single")]["clean"]
print(f"H22: best single-2x first-pass clean (ledger, s_x 1 mm, low warp) = {h22:.4f} -> "
      f"{'held' if h22 < 0.95 else 'refuted'} (refuted at >= 0.95)")
print(f"H23: two 2x, single read (ledger, s_x 1 mm, low warp) = {h23:.4f} -> "
      f"{'held' if h23 >= 0.95 else 'refuted'} (refuted below 0.95)")
deltas = {k[:3] + (k[4],): A[k]["clean"] - A[k[:3] + ("nowait",) + k[4:]]["clean"]
          for k in A if k[3] == "none"}
worst = max(deltas.items(), key=lambda kv: kv[1])
print(f"H26: largest clean-sheet loss from no-wait recoil over {len(deltas)} pipelines = "
      f"{100 * worst[1]:.2f} points at {worst[0]} -> {'held' if worst[1] < 0.02 else 'refuted'}\n")
out["H22"], out["H23"] = h22, h23
out["H26"] = {"max_loss": worst[1], "at": list(worst[0]),
              "all": [{"pipeline": list(k), "loss": v} for k, v in deltas.items()]}

# B. seconds a sheet; recoil waited out; ledger s_x 1 mm, low warp
NAIL = {54.0: True, 121.0: False}          # buildbot-mobilebase: fast tip and base; slow (2 s settle)
PLACE = (15.0, 30.0, 60.0)
LEDGER = (0.0, 10.0, 20.0)
READ = (1.0, 3.0)
FIX = (15.0, 30.0, 60.0)
grid = list(itertools.product(NAIL, PLACE, LEDGER, READ, FIX))
print(f"## B. Seconds a sheet including rework ({len(grid)} time cells; ledger s_x 1 mm, low warp, recoil waited out;"
      " extra joint stud not charged)")


def secs(fr, p, cell, warp="low", placement=BASE, t_frame=0.0):
    tn, tp, tl, trd, tf = cell
    m = A[(fr, placement, warp, "none", p)]["missed"]
    return C.seconds(m, policy=p, framing=fr, placement=PLACEMENTS[placement]["placement"], recoil="wait",
                     t_nail=tn, fast_arm=NAIL[tn], t_place=tp, t_ledger=tl, t_read=trd, t_fix=tf, t_frame=t_frame)


B = []
wins = {fr: {p: 0 for p in POLICIES} for fr in FRAMINGS}
wins30 = {fr: {p: 0 for p in POLICIES} for fr in FRAMINGS}
n30 = 0
for cell in grid:
    row = {"t_nail": cell[0], "t_place": cell[1], "t_ledger": cell[2], "t_read": cell[3], "t_fix": cell[4]}
    for fr in FRAMINGS:
        tot = {p: secs(fr, p, cell)["total"] for p in POLICIES}
        best = min(tot, key=tot.get)
        wins[fr][best] += 1
        if cell[4] >= 30:
            wins30[fr][best] += 1
        row[fr] = tot
    n30 += cell[4] >= 30
    B.append(row)
out["B"] = B
print("fastest policy, count of cells: " + "; ".join(f"{fr}: {wins[fr]}" for fr in FRAMINGS))
print("  with rework >= 30 s: " + "; ".join(f"{fr}: {wins30[fr]}" for fr in FRAMINGS) + f" of {n30}")
share_single = wins["2x2x"]["single"] / len(grid)
share_multi = (wins30["2x"]["three"] + wins30["2x"]["dense"]) / n30
print(f"H24: single read fastest on two 2x in {100 * share_single:.0f}% of cells; three/dense fastest on single 2x "
      f"in {100 * share_multi:.0f}% of rework >= 30 s cells -> "
      f"{'held' if share_single >= 0.9 and share_multi >= 0.9 else 'refuted'}")
out["H24"] = {"wins": wins, "wins_fix_ge30": wins30, "share_single_2x2x": share_single, "share_multi_2x": share_multi}

print("\nexamples (seconds: place / sense / nail / rework = total)")
for cell in [(54.0, 30.0, 10.0, 1.0, 30.0), (54.0, 30.0, 10.0, 3.0, 30.0), (121.0, 30.0, 10.0, 3.0, 60.0)]:
    print(f"  nail {cell[0]:.0f}, place {cell[1]:.0f}, ledger {cell[2]:.0f}, read {cell[3]:.0f}, fix {cell[4]:.0f}:")
    for fr in FRAMINGS:
        for p in POLICIES:
            s = secs(fr, p, cell)
            print(f"    {fr:5s} {p:6s} {s['place']:5.1f} / {s['sense']:5.1f} / {s['nail']:5.1f} / "
                  f"{s['rework']:5.1f} = {s['total']:6.1f}")
print()

# C. break-even framing time for the extra joint stud (H25), at rework 30 s
print("## C. Break-even time to frame the extra joint stud: best single-2x seconds minus best two-2x seconds")
be = []
for cell in grid:
    tn, tp, tl, trd, tf = cell
    b2 = min(secs("2x", p, cell)["total"] for p in POLICIES)
    b22 = min(secs("2x2x", p, cell)["total"] for p in POLICIES)
    be.append({"cell": list(cell), "break_even": b2 - b22})
be_all = np.array([b["break_even"] for b in be])
be30 = np.array([b["break_even"] for b in be if b["cell"][4] == 30.0])
print(f"all {len(be)} cells: min {be_all.min():.1f} s, median {np.median(be_all):.1f} s, max {be_all.max():.1f} s")
for tf in FIX:
    v = np.array([b["break_even"] for b in be if b["cell"][4] == tf])
    print(f"  rework {tf:.0f} s: min {v.min():.1f}, max {v.max():.1f} s")
print(f"H25: break-even at rework 30 s, min over {be30.size} cells = {be30.min():.1f} s -> "
      f"{'held' if be30.min() >= 20 else 'refuted'} (refuted under 20 s)")
for w in ("high",):
    vv = []
    for cell in grid:
        b2 = min(secs("2x", p, cell, warp=w)["total"] for p in POLICIES)
        b22 = min(secs("2x2x", p, cell, warp=w)["total"] for p in POLICIES)
        vv.append(b2 - b22)
    print(f"  higher warp (unscored): min {min(vv):.1f}, median {np.median(vv):.1f}, max {max(vv):.1f} s")
    out["C_high"] = vv
out["C"] = be
print()

# D. stage shares (H27): two 2x, single read
print("## D. Where the seconds go: two 2x, single read (share of the sheet)")
sh = []
largest_other = 0
for cell in grid:
    s = secs("2x2x", "single", cell)
    shares = {k: s[k] / s["total"] for k in ("place", "sense", "nail", "rework")}
    sh.append({"cell": list(cell), **shares})
    largest_other = max(largest_other, max(v for k, v in shares.items() if k != "nail") - shares["nail"])
for k in ("place", "sense", "nail", "rework"):
    v = np.array([x[k] for x in sh])
    print(f"  {k:7s} {100 * v.min():5.1f}% to {100 * v.max():5.1f}% (median {100 * np.median(v):.1f}%)")
nail_largest = sum(1 for x in sh if x["nail"] >= max(x["place"], x["sense"], x["rework"]))
print(f"H27: nailing the largest stage in {nail_largest} of {len(sh)} cells -> "
      f"{'held' if nail_largest == len(sh) else 'refuted'}")
out["D"] = sh
out["H27"] = {"nail_largest": nail_largest, "cells": len(sh)}
tot22 = np.array([secs("2x2x", "single", c)["total"] for c in grid])
tot2 = np.array([min(secs("2x", p, c)["total"] for p in POLICIES) for c in grid])
print(f"\ntwo 2x, single read: {tot22.min():.0f} to {tot22.max():.0f} s a sheet (median {np.median(tot22):.0f}); "
      f"best single 2x: {tot2.min():.0f} to {tot2.max():.0f} s (median {np.median(tot2):.0f})")
print("context, nailing only: buildbot-custom gantry 61 s; buildbot-taskbook hand nailing 372 s (author's minutes)")
out["totals"] = {"2x2x_single": [float(tot22.min()), float(np.median(tot22)), float(tot22.max())],
                 "2x_best": [float(tot2.min()), float(np.median(tot2)), float(tot2.max())]}

# E. lift-tack placement and s_x 3 mm (unscored)
print("\n## E. Other placements, two 2x and single 2x, best policy at the middle cell (nail 54, place 30, "
      "ledger 10, read 2, fix 30)")
mid = (54.0, 30.0, 10.0, 2.0, 30.0)
for pl in PLACEMENTS:
    for fr in FRAMINGS:
        for w in WARPS:
            tot = {p: secs(fr, p, mid, warp=w, placement=pl)["total"] for p in POLICIES}
            best = min(tot, key=tot.get)
            r = A[(fr, pl, w, "none", best)]
            print(f"  {pl:26s} {fr:5s} {w:4s}: best {best:6s} {tot[best]:6.1f} s, clean {r['clean']:.4f}")

with open(os.path.join(HERE, "results.json"), "w") as f:
    json.dump(out, f, indent=1, default=float)
