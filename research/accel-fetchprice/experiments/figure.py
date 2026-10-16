"""Breakeven curves from results.json only."""
import json, os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
fig, ax = plt.subplots(1, 2, figsize=(8, 3.4))
for shape, st in (("L1 64x70", "o-"), ("L2 11x64", "s--")):
    pts = [r for r in R if r["shape"] == shape and r["e_flop_star_over_e_w"] is not None]
    ax[0].plot([p["B"] for p in pts], [p["e_flop_star_over_e_w"] for p in pts], st, label=shape)
    pts = [r for r in R if r["shape"] == shape and r["r_psum_star"] is not None]
    ax[1].plot([p["B"] for p in pts], [p["r_psum_star"] for p in pts], st, label=shape)
for a in ax:
    a.set_xscale("log", base=2); a.set_xlabel("batch B")
ax[0].set_yscale("log"); ax[0].set_ylabel("breakeven e_flop / e_weight_fetch  (per cycle)")
ax[1].set_ylabel("breakeven e_psum_word / e_weight_fetch"); ax[1].set_ylim(0, 1)
ax[0].legend(fontsize=8)
fig.suptitle("accel-fetchprice: WS wins below each curve (constants unmeasured)", fontsize=9)
fig.tight_layout(); fig.savefig(os.path.join(HERE, "fetchprice.png"), dpi=110)
