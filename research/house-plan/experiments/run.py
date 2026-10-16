"""Experiments for house-plan. Deterministic; writes experiments/results.txt. About a minute."""
import os
import random
import statistics
import sys

sys.path[:0] = [os.path.join(os.path.dirname(__file__), p) for p in ("../src", "../../house-spans/src", "../../house-framing/src")]
from house_plan.plan import Params, make_plan
from house_plan.rules import check_layout
from house_plan.search import GRID, KEYS, evaluate, exhaustive, local_search, random_search, size_of_grid
from house_plan.takeoff import bom_lines, takeoff

out = []


def say(s=""):
    print(s)
    out.append(s)


say("A. The default plan (28 x 28 ft, 2 bedrooms, 16 in studs and joists, 24 in rafters, 6:12 roof)")
p = Params()
plan = make_plan(p)
t = takeoff(plan)
say(f"rooms: " + ", ".join(f"{r.name} {r.w:g}x{r.d:g}" for r in plan.rooms))
say(f"walls {len(plan.walls)}, openings {len(plan.openings)}; layout failures {check_layout(plan) or 'none'}; takeoff failures {t['failures'] or 'none'}")
say(f"members: {t['sizes']}; central bearing wall: {t['central_wall']}")
for k, v in sorted(t["bf"].items()):
    say(f"  {k:5s} {v:8.0f} bf")
say(f"framing total {t['total_bf']:.0f} bf = {t['total_bf'] / t['floor_area']:.2f} bf/sq ft of floor")
say("sheets: " + ", ".join(f"{k} {n}" for k, (sf, n) in t["sheets"].items()))
say()

say(f"B. Exhaustive search over {size_of_grid()} plans, lowest framing lumber per sq ft of floor, with at least 2 bedrooms, by target floor area (target to 1.15 x target)")
optima = {}
for min_area in (600, 800, 1000, 1200, 1400):
    (score, v), n = exhaustive(min_area, 2)
    d = evaluate(v, min_area, 2)[1]
    optima[min_area] = score
    pr = dict(zip(KEYS, v))
    if not d["feasible"]:
        say(f"floor area {min_area}-{1.15 * min_area:.0f} sq ft: no feasible plan in the grid (best infeasible: {d['bad'][:2]})")
        continue
    say(f"floor area {min_area}-{1.15 * min_area:.0f} sq ft: best {score:.3f} bf/sq ft; {pr['width']:g} x {pr['depth']:g} ft ({d['area']:.0f} sq ft), "
        f"{pr['n_bed']} bed, bed zone {pr['bed_depth']:g} ft, window {pr['win_w']:g} ft, pitch {pr['pitch']}:12, "
        f"oc studs {pr['stud_oc']} joists {pr['joist_oc']} rafters {pr['rafter_oc']}")
    say(f"   members {d['sizes']}, central wall {d['central_wall']}, {d['bf']:.0f} bf")
say()

say("C. How much of the grid is feasible, and what stops the rest (floor area 1000-1150 sq ft)")
import itertools
from collections import Counter
reasons = Counter()
nf = 0
total = 0
for v in itertools.product(*(GRID[k] for k in KEYS)):
    s, d = evaluate(v, 1000)
    total += 1
    if d["feasible"]:
        nf += 1
    else:
        for b in d["bad"]:
            reasons[b.split(":")[0] if b[0] == "R" else b.split(" ")[0] + " " + b.split(" ")[1]] += 1
        if not 1000 <= d["area"] <= 1150:
            reasons["area outside 1000-1150"] += 1
say(f"feasible {nf} of {total} ({100 * nf / total:.1f}%)")
for k, c in reasons.most_common(8):
    say(f"  {k}: {c} plans")
say()

say("D. Search methods at equal evaluation budgets (floor area 1000-1150 sq ft, at least 2 bedrooms; 40 seeds; gap = score minus the exhaustive optimum, bf/sq ft)")
opt = optima[1000]
say(f"optimum {opt:.3f}")
say(f"{'budget':>7} {'method':>7} {'found feasible':>15} {'median gap':>11} {'mean gap':>9} {'hit optimum':>12}")
for budget in (100, 500, 2000):
    for name, fn in (("random", random_search), ("local", local_search)):
        gaps = []
        for seed in range(40):
            s, v = fn(budget, 1000, random.Random(seed), min_bed=2)
            gaps.append(s - opt)
        feas = sum(1 for g in gaps if g < 90)
        hit = sum(1 for g in gaps if g < 1e-9)
        fg = [g for g in gaps if g < 90]
        say(f"{budget:7d} {name:>7} {feas:11d}/40 {statistics.median(fg) if fg else float('nan'):11.3f} "
            f"{statistics.mean(fg) if fg else float('nan'):9.3f} {hit:9d}/40")
say()

say("E. Lumber per sq ft against floor area, best plan at each minimum area (exhaustive, at least 2 bedrooms)")
for min_area in (500, 700, 900, 1100, 1300):
    (score, v), n = exhaustive(min_area, 2)
    pr = dict(zip(KEYS, v))
    if score >= 100:
        say(f"floor area {min_area:5d}-{1.15 * min_area:.0f}: no feasible plan")
        continue
    say(f"floor area {min_area:5d}-{1.15 * min_area:.0f}: {pr['width']:g} x {pr['depth']:g} ft = {pr['width'] * pr['depth']:5.0f} sq ft, {score:.3f} bf/sq ft")

open(os.path.join(os.path.dirname(__file__), "results.txt"), "w").write("\n".join(out) + "\n")
