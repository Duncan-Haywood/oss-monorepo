"""Area and clock-pin energy of the four engines against batch size, from results.json only. Needs matplotlib."""
import json, os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
HERE = os.path.dirname(os.path.abspath(__file__))
rows = json.load(open(os.path.join(HERE, "results.json")))["rows"]
fig, ax = plt.subplots(1, 2, figsize=(9, 3.4))
for k, (key, lab) in enumerate((("area_um2", "synthesised area (1000 um$^2$)"), ("clk_fj_per_cycle", "accumulator clock-pin energy (pJ/cycle)"))):
    for mode, name, st in ((0, "OS", "k--"), (1, "WS ungated", "o-"), (2, "WS gate/accumulator", "s-"), (3, "WS gate/set", "^-")):
        pts = sorted((r["B"], r[key]) for r in rows if r["mode"] == mode and r["shape"].startswith("L1"))
        ax[k].plot([p[0] for p in pts], [p[1] / 1000 for p in pts], st, label=name)
    ax[k].set_xscale("log", base=2); ax[k].set_xlabel("batch B (layer 64x70, P = 8)"); ax[k].set_ylabel(lab); ax[k].grid(alpha=.3)
ax[0].legend(fontsize=8)
fig.tight_layout(); fig.savefig(os.path.join(HERE, "gatedrtl.png"), dpi=130)
