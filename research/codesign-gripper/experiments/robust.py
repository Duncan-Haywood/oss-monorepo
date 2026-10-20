"""Stress test: re-score the best design of each method, unchanged, with lower pad friction and with object
offsets doubled and tripled. Not part of the search. Writes robust.txt."""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from codesign_gripper import gripper as G

R = json.load(open(os.path.join(HERE, "results.json")))
cands = {"session agent best": max(R["agent"], key=lambda r: r["J"])}
for n, runs in R["baseline_evals"].items():
    cands[n + " best (any seed)"] = max((r for run in runs for r in run), key=lambda r: r["J"])
cands["overall best"] = R["best"]
conds = [("nominal", 0.5, 1.0), ("pad mu 0.35", 0.35, 1.0), ("offsets x3", 0.5, 3.0), ("mu 0.35 and offsets x3", 0.35, 3.0)]
lines = ["Success rate (of 8 objects) of each method's best design, re-scored under harder conditions (no re-search).",
         "design (L, t, w, a) | " + " | ".join(c[0] for c in conds)]
for name, r in cands.items():
    cells = []
    for _, mu, off in conds:
        G.PAD_MU, G.OFFSET_SCALE = mu, off
        cells.append(f"{G.evaluate(r['x'])['success']:.3f}")
    lines.append(f"{name}: {[round(v, 1) for v in r['x']]} | " + " | ".join(cells))
G.PAD_MU, G.OFFSET_SCALE = 0.5, 1.0
open(os.path.join(HERE, "robust.txt"), "w").write("\n".join(lines) + "\n")
print("\n".join(lines))
