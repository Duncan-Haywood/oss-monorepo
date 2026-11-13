"""Milestone 10: what the straight-stud ceiling of single-2x joints is made of, and two placement
remedies (slide, shim).

    python experiments/m10_ceiling/run.py > experiments/m10_ceiling/results.txt

Writes results.json beside this file. Reads ../m6b_bowed_edge/results.json (the smooth-bow seats).
Hypotheses H45-H48 were registered in LOG.md before this script was run. A few minutes on one CPU.
"""
import itertools
import json
import math
import os
import platform
import sys
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from buildbot_sheathing import ceiling as Q  # noqa: E402
from buildbot_sheathing import cycle as C  # noqa: E402
from buildbot_sheathing import straighten as S  # noqa: E402
from buildbot_sheathing.budget import HEIGHT, Z_JOINT  # noqa: E402

T0 = time.time()
MM = 1e-3
N = 20000
m6b = json.load(open(os.path.join(HERE, "..", "m6b_bowed_edge", "results.json")))
ROCKS = {"three-foot": None, "smooth (Drake)": np.radians(np.array(m6b["F_draws"]["drake_deg"]))}
MID = S.Straightener("mid", Z_JOINT / HEIGHT, "pinned", 0.5e-3)
out = {"versions": {"python": platform.python_version(), "numpy": np.__version__}, "trials": N, "seed": 7}

print("# Milestone 10: what the straight-stud ceiling is made of (buildbot-sheathing)")
print(f"ledger pipeline, single 2x, three stud reads, edge aim, {N:,} sheets, seed 7; "
      f"tool {C.S_ROBOT / MM:.1f} mm, stud read {Q.S_READ / MM:.1f} mm, edge read {Q.S_EDGE / MM:.1f} mm, "
      f"slide {Q.S_X / MM:.1f} mm\n")

# ------------------------------------------------------------------ A. closed form
print("## A. Tool scatter alone against the closed form (straight studs, perfect pose and reads)")
cf = Q.tool_only_closed_form()
mc = Q.clean(on=("tool",))["clean"]
lo, hi = C.wilson(mc, N)
h45 = abs(mc - cf) <= 0.003
print(f"closed form {cf:.4f}; Monte Carlo {mc:.4f} [{lo:.4f}, {hi:.4f}]; |diff| {abs(mc - cf):.4f} (bar 0.003)")
print(f"H45 -> {'held' if h45 else 'refuted'}\n")
out["A"] = {"closed": cf, "mc": mc, "H45": h45}

# ------------------------------------------------------------------ B. Shapley shares
print("## B. Shapley shares of -ln(clean) on straight studs, six sources, all 64 subsets")
out["B"] = {}
h46 = True
for rname, rd in ROCKS.items():
    def value(s, rd=rd):
        c = Q.clean(on=s, rock_draw=rd)["clean"]
        return -math.log(max(c, 1.0 / N))
    phi, cache = Q.shapley(value, Q.SOURCES)
    total = value(frozenset(Q.SOURCES))
    pose = sum(phi[p] for p in Q.POSE)
    h46 &= pose / total >= 0.5
    alone = {p: math.exp(-cache[frozenset([p])]) for p in Q.SOURCES}
    without = {p: math.exp(-cache[frozenset(Q.SOURCES) - {p}]) for p in Q.SOURCES}
    out["B"][rname] = {"phi": phi, "total": total, "clean_all": math.exp(-total), "pose_share": pose / total,
                       "alone": alone, "without": without,
                       "subsets": {",".join(sorted(k)) or "-": math.exp(-v) for k, v in cache.items()}}
    print(f"\n{rname}: clean with all six {math.exp(-total):.4f} (-ln {total:.4f})")
    print("source   share    alone (clean)   all but this (clean)")
    for p in Q.SOURCES:
        print(f"{p:7s} {phi[p] / total:6.1%}    {alone[p]:.4f}          {without[p]:.4f}")
    print(f"pose (slide + ledger + panel) {pose / total:.1%}; tool + reads {1 - pose / total:.1%}")
    sub = out["B"][rname]["subsets"]
    print(f"interaction: pose alone {sub['ledger,panel,slide']:.4f} clean, tool and reads alone "
          f"{sub['edge,stud,tool']:.4f}, tool and pose {sub['ledger,panel,slide,tool']:.4f}: neither group misses "
          "on its own; each narrows the window the other must hit")
print(f"\nH46: pose carries >= 50% of -ln(clean) in both rock models -> {'held' if h46 else 'refuted'}\n")
out["H46"] = h46

# ------------------------------------------------------------------ C. remedies
print("## C. Placement remedies: clean sheets [95% Wilson] and missed nails a sheet")
print("rock            studs              remedy                       clean   [95%]            missed")
REM = [("none", {}),
       ("slide 0.25 mm", dict(slide=0.25 * MM)), ("slide 0.5 mm", dict(slide=0.5 * MM)),
       ("slide 1 mm", dict(slide=1.0 * MM)),
       ("shim 0.5 mm", dict(shim=0.5 * MM)),
       ("slide+shim 0.25 mm", dict(slide=0.25 * MM, shim=0.25 * MM)),
       ("slide+shim 0.5 mm", dict(slide=0.5 * MM, shim=0.5 * MM)),
       ("slide+shim 1 mm", dict(slide=1.0 * MM, shim=1.0 * MM))]
STUDS = [("straight", dict(warp="straight")),
         ("low, mid push", dict(warp="low", straighten=MID)),
         ("high, mid push", dict(warp="high", straighten=MID))]
out["C"] = []
for (rname, rd), (sname, skw) in itertools.product(ROCKS.items(), STUDS):
    for label, rkw in REM:
        r = Q.clean(rock_draw=rd, **skw, **rkw)
        lo, hi = C.wilson(r["clean"], N)
        out["C"].append({"rock": rname, "studs": sname, "remedy": label, **r})
        print(f"{rname:15s} {sname:18s} {label:28s} {r['clean']:.4f} [{lo:.3f},{hi:.3f}]  {r['missed']:.2f}")
    r = Q.clean(rock_draw=rd, policy="dense", **skw, slide=0.5 * MM, shim=0.5 * MM)
    out["C"].append({"rock": rname, "studs": sname, "remedy": "slide+shim 0.5 mm, dense reads", **r})
    print(f"{rname:15s} {sname:18s} {'slide+shim 0.5, dense reads':28s} {r['clean']:.4f}"
          f"                  {r['missed']:.2f}")


def cell(rock, studs, remedy):
    return next(d for d in out["C"] if d["rock"] == rock and d["studs"] == studs and d["remedy"] == remedy)


gain = {rn: cell(rn, "straight", "slide 0.5 mm")["clean"] - cell(rn, "straight", "none")["clean"] for rn in ROCKS}
h47 = all(g >= 0.05 for g in gain.values())
print(f"\nH47: slide (0.5 mm) gain on straight studs: " + ", ".join(f"{k} {v * 100:+.1f} points" for k, v in gain.items())
      + f" (bar +5) -> {'held' if h47 else 'refuted'}")
v48 = cell("smooth (Drake)", "low, mid push", "slide+shim 0.5 mm")["clean"]
h48 = v48 >= 0.95
print(f"H48: slide+shim 0.5 mm, mid push, low warp, smooth rock: {v48:.4f} (bar 0.95) -> {'held' if h48 else 'refuted'}\n")
out["H47"], out["H48"], out["H47_gain"] = h47, h48, gain

# ------------------------------------------------------------------ D. tool scatter needed
print("## D. Largest tool scatter (1 sigma, mm) that still gives 95% clean (bisection, 12 steps)")
print("rock            studs              remedy                 s_robot for 95%")


def need(rd, skw, rkw, target=0.95):
    f = lambda s: Q.clean(rock_draw=rd, s_robot=s, **skw, **rkw)["clean"]  # noqa: E731
    lo_, hi_ = 0.0, 2.0 * MM
    if f(1e-9) < target:
        return 0.0
    for _ in range(12):
        m = (lo_ + hi_) / 2
        if f(m) >= target:
            lo_ = m
        else:
            hi_ = m
    return lo_


out["D"] = []
for (rname, rd), (sname, skw), (label, rkw) in itertools.product(
        ROCKS.items(), STUDS[:2], [("none", {}), ("slide+shim 0.5 mm", dict(slide=0.5 * MM, shim=0.5 * MM))]):
    s = need(rd, skw, rkw)
    out["D"].append({"rock": rname, "studs": sname, "remedy": label, "s_robot_mm": s / MM})
    print(f"{rname:15s} {sname:18s} {label:22s} {s / MM:.3f}" + ("  (not reachable with a perfect tool)" if s == 0 else ""))

out["wall_s"] = time.time() - T0
print(f"\nwall time {out['wall_s']:.0f} s")
json.dump(out, open(os.path.join(HERE, "results.json"), "w"), indent=1, default=float)
