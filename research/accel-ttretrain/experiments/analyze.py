"""Summarise results.json: headroom against the tile's limits, and agreement with the accuracies accel-ttfit assumed."""
import json, os
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))["rows"]
old = {(r["inputs"], r["hidden"], r["wbits"]): r for r in json.load(open(os.path.join(HERE, "..", "..", "accel-ttfit", "data", "accuracy.json")))["rows"]}
seeds = [s for r in R for s in r["seeds"]]
out = []
out.append(f"models {len(seeds)}; fit all four limits: {sum(s['fits'] for s in seeds)}")
out.append(f"overflowing activations (train+test, all models): layer1 {sum(s['n_a1_over'] for s in seeds)}, layer2 {sum(s['n_a2_over'] for s in seeds)}")
for k, lim in (("max_b1", 1 << 15), ("max_b2", 1 << 15), ("max_a1", 1 << 19), ("max_a2", 1 << 19)):
    v = max(s[k] for s in seeds)
    out.append(f"largest {k}: {v} of {lim} ({100 * v / lim:.1f}% of the limit)")
out.append(f"largest |acc_ref - acc_tile|: {max(abs(s['acc_ref'] - s['acc_tile']) for s in seeds):.4f}")
out.append("")
out.append("  in  H wb | retrained mean  accel-ttfit assumed | diff")
diffs = []
for r in R:
    m = np.mean([s["acc_tile"] for s in r["seeds"]])
    o = old[(r["inputs"], r["hidden"], r["wbits"])]["test_mean"]
    diffs.append(m - o)
    out.append(f"{r['inputs']:4d} {r['hidden']:3d} {r['wbits']:2d} | {m:.4f}   {o:.4f} | {m - o:+.4f}")
out.append(f"mean diff {np.mean(diffs):+.4f}, max |diff| {np.max(np.abs(diffs)):.4f}")
open(os.path.join(HERE, "results.txt"), "w").write("\n".join(out) + "\n")
print("\n".join(out))

# headroom by hidden width: the largest value over weight widths and seeds, as % of the tile limit
with open(os.path.join(HERE, "results.txt"), "a") as f:
    f.write("\n== headroom (% of limit, worst over weight widths and 3 seeds)\n")
    f.write("  H | layer1 acc 70in | layer1 acc 120in | layer2 acc 120in | bias 120in\n")
    def worst(inp, h, k, lim):
        return 100 * max(s[k] for r in R if r["inputs"] == inp and r["hidden"] == h for s in r["seeds"]) / lim
    for h in (8, 16, 32, 64):
        f.write(f"{h:3d} | {worst(70, h, 'max_a1', 1 << 19):.1f} | {worst(120, h, 'max_a1', 1 << 19):.1f} | "
                f"{worst(120, h, 'max_a2', 1 << 19):.1f} | {worst(120, h, 'max_b1', 1 << 15):.1f}\n")
