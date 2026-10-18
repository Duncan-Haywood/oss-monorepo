"""WS-over-OS cell ratio against batch for the original and rewritten engine, from results.json only."""
import json, os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
d = {(r["shape"], r["B"], r["design"], r["variant"]): r["cells"] for r in R}
fig, ax = plt.subplots(1, 2, figsize=(8, 3.4), sharey=True)
for a, shape in zip(ax, ("L1 64x70", "L2 11x64")):
    for v, st in (("orig", "o-"), ("new", "s--")):
        bs = (1, 2, 4, 8, 16)
        a.plot(bs, [d[(shape, b, "WS", v)] / d[(shape, b, "OS", v)] for b in bs], st, label=f"{v} engine")
    a.set_xscale("log", base=2); a.set_xlabel("batch B"); a.set_title(shape, fontsize=9); a.axhline(1, color="gray", lw=0.5)
ax[0].set_ylabel("WS cells / OS cells (same variant)"); ax[0].legend(fontsize=8)
fig.suptitle("accel-planemux: rewriting the accumulator read leaves WS/OS area where it was (P = 8)", fontsize=9)
fig.tight_layout(); fig.savefig(os.path.join(HERE, "planemux.png"), dpi=110)
