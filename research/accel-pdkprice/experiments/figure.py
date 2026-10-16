"""Minimum weight-fetch energy for register-file WS to win, against macro energies. From results.json only."""
import json, os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
fig, ax = plt.subplots(figsize=(6.4, 3.8))
for shape, st in (("L1 64x70", "o-"), ("L2 11x64", "s--")):
    pts = [b for b in R["breakeven"] if b["shape"] == shape]
    ax.plot([p["B"] for p in pts], [p["min_e_weight_pj"] for p in pts], st, color="k", label=f"WS needs e_weight above this ({shape})")
cols = ["#1b9e77", "#d95f02", "#7570b3", "#e7298a"]
for k, (c, m) in enumerate(zip(cols, R["macros"])):
    per = m["width"] // 4
    ax.axhline(m["access_pj"] / per, color=c, ls=":", lw=1.2)
    ax.text(2.1 + 1.5 * k, m["access_pj"] / per * 0.9, f"{m['width']}b packed", color=c, fontsize=6.5, va="top")
    ax.axhline(m["access_pj"], color=c, ls="-", lw=0.8, alpha=0.6)
    ax.text(17, m["access_pj"], f"{m['width']}b unpacked", color=c, fontsize=7, va="bottom")
ax.set_xscale("log", base=2); ax.set_yscale("log"); ax.set_xlim(2, 40); ax.set_xlabel("batch B")
ax.set_ylabel("pJ per 4-bit weight fetch"); ax.legend(fontsize=7, loc="upper left")
ax.set_title("accel-pdkprice: WS wins where a macro line sits above the black line (SKY130 liberty)", fontsize=8)
fig.tight_layout(); fig.savefig(os.path.join(HERE, "pdkprice.png"), dpi=110)
