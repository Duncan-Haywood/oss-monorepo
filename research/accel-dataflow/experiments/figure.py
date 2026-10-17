"""Energy per inference vs lanes for each dataflow (7 segments, 64 hidden, 4-bit model), from results.json."""
import json, os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
M = json.load(open(os.path.join(HERE, "..", "..", "accel-kws", "experiments", "results.json")))["rows"]
k = [i for i, m in enumerate(M) if m["segments"] == 7 and m["hidden"] == 64 and m["wbits"] == 4][0]
fig, ax = plt.subplots(1, 2, figsize=(9, 3.4), sharey=True)
for a, B in zip(ax, (1, 4)):
    for df, st in zip(("OS", "WS", "IS", "RT"), ("o-", "s--", "^-", "x:")):
        pts = sorted((r["P"], r["energy_nj"]) for r in R if r["model"] == k and r["B"] == B and r["df"] == df and r["psum_scale"] == 1.0)
        a.plot(*zip(*pts), st, label=df)
    a.set_xscale("log", base=2); a.set_yscale("log"); a.set_xlabel("MAC lanes P"); a.set_title(f"batch B={B}")
ax[0].set_ylabel("energy per inference (nJ, assumed constants)"); ax[0].legend()
fig.suptitle("accel-dataflow: dataflow vs lanes, 7-seg/64-hidden/4-bit KWS MLP (stylised)", fontsize=9)
fig.tight_layout(); fig.savefig(os.path.join(HERE, "dataflow.png"), dpi=110)
