"""Gated vs ungated minimum weight-fetch energy for the 64x70 layer, against the SKY130 macros. From results.json only."""
import json, os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
pts = [m for m in R["min_e_weight"] if m["shape"] == "L1 64x70"]
B = [p["B"] for p in pts]
fig, ax = plt.subplots(figsize=(6.4, 3.8))
ax.plot(B, [p["ungated_pj"] for p in pts], "ko-", label="ungated flops")
for g, st in ((24, "s--"), (192, "^:")):
    ax.plot(B, [p[f"G{g}_pj"] for p in pts], st, color="#1b9e77" if g == 24 else "#7570b3", label=f"one clock gate per {g} flops")
ax.axhspan(0.8, 2.9, color="#d95f02", alpha=0.18, label="packed SKY130 macros (0.8-2.9 pJ)")
ax.set_xscale("log", base=2); ax.set_yscale("log"); ax.set_xlabel("batch B")
ax.set_ylabel("pJ per 4-bit weight fetch WS needs to win"); ax.legend(fontsize=7, loc="upper left")
ax.set_title("accel-gatedprice: WS wins wherever a weight costs more than the line (SKY130 liberty)", fontsize=8)
fig.tight_layout(); fig.savefig(os.path.join(HERE, "gatedprice.png"), dpi=110)
