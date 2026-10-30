"""Check the k-dependent halving regret bound (sum of iota^(k_j)) against the milestone 6 bound and realised regret (milestone 37).
Runs no flow. Writes kth_results.txt and kth_summary.json. Usage: python3 kth.py"""
import json
import math
import random
import statistics
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "src"))
from verified_dse import bound, flow  # noqa: E402

DRAWS, ETA = 200, 3
rows = [json.loads(l) for l in (HERE.parent / "rung_bias" / "results.jsonl").read_text().splitlines()]
by = defaultdict(list)
for r in rows:
    if r["status"] == "ok":
        by[(r["tag"], r["design"])].append(flow.scores(r))

out = ["log-units; old = sum of iota over cut rungs (milestone 6); new = sum of iota^(k_j); spread = log(max y / min y); realised = mean over 200 random tie-breaks",
       "clock | design | start | n | keep | old | new | new/old | realised | spread"]
cells, viol = [], 0
for tag in ("tight", "relaxed"):
    for d in flow.DESIGNS:
        sc = by[(tag, d)]
        n = len(sc)
        y = [s["r4"] for s in sc]
        s = {g: [p[g] for p in sc] for g in ("r1", "r2", "r3")}
        keep = [max(1, n // ETA), max(1, n // ETA ** 2), max(1, n // ETA ** 3)]
        spread = math.log(max(y)) - math.log(min(y))
        for name, rungs, kp in (("r1", ("r1", "r2", "r3"), keep), ("r2", ("r2", "r3"), keep[:2])):
            rng = random.Random(f"kth{tag}{d}{name}")
            regs = [math.log(bound.halve([s[g] for g in rungs], y, kp, rng)) - math.log(min(y)) for _ in range(DRAWS)]
            old = sum(bound.inversion(s[g], y) for g in rungs)
            new = sum(bound.kth_inversion(s[g], y, k) for g, k in zip(rungs, kp))
            viol += sum(r > new + 1e-9 for r in regs)
            c = {"cell": f"{tag}:{d}:{name}", "old": old, "new": new, "realised": statistics.mean(regs), "max_realised": max(regs), "spread": spread}
            cells.append(c)
            out.append(f"{tag} | {d} | {name} | {n} | {kp} | {old:.3f} | {new:.3f} | {(new / old if old > 0 else float('nan')):.3f} | {c['realised']:.3f} | {spread:.3f}")
pos = [c for c in cells if c["old"] > 0]
ratio = [c["new"] / c["old"] for c in pos]
out += ["",
        f"violations (realised regret above the new bound, over {len(cells)} cells x {DRAWS} tie-breaks): {viol}",
        f"cells with old bound > 0: {len(pos)} of {len(cells)}; new < old in {sum(c['new'] < c['old'] - 1e-12 for c in pos)}; ratio median {statistics.median(ratio):.3f}, min {min(ratio):.3f}, max {max(ratio):.3f}",
        f"non-vacuous (bound < spread): old {sum(c['old'] < c['spread'] for c in cells)}, new {sum(c['new'] < c['spread'] for c in cells)} of {len(cells)}",
        f"median bound / max realised regret over cells with max realised > 0: old {statistics.median([c['old'] / c['max_realised'] for c in cells if c['max_realised'] > 0]):.2f}, new {statistics.median([c['new'] / c['max_realised'] for c in cells if c['max_realised'] > 0]):.2f}"]
(HERE / "kth_results.txt").write_text("\n".join(out) + "\n")
(HERE / "kth_summary.json").write_text(json.dumps({"cells": cells, "violations": viol}, indent=1))
print("\n".join(out[-5:]))
