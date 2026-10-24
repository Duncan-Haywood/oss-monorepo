"""Winner's-curse check from results.json: validation minus test accuracy of the picks, singles vs any."""
import json, os
import numpy as np
r = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "results.json")))
lines = ["target | val-test gap, single pick | val-test gap, single-or-cascade pick | test acc diff (any - single), mean | energy ratio (any/single), mean"]
for tg in r["targets"]:
    g1, g2, d, e = [], [], [], []
    for s in r["per_seed"]:
        x = s["targets"][str(tg)]
        if x["single"] is None:
            continue
        g1.append(x["single"]["val"] - x["single"]["test"]); g2.append(x["any"]["val"] - x["any"]["test"])
        d.append(x["any"]["test"] - x["single"]["test"]); e.append(x["any"]["e_test"] / x["single"]["e_test"])
    lines.append(f"{tg:.2f} | {np.mean(g1):+.4f} | {np.mean(g2):+.4f} | {np.mean(d):+.4f} | {np.mean(e):.3f}")
open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "gap.txt"), "w").write("\n".join(lines) + "\n")
print("\n".join(lines))
