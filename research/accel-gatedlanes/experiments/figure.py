"""Area and clock-pin energy of the four engines against lane count P at B = 8, from results.json only. Needs matplotlib."""
import json, os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
HERE = os.path.dirname(os.path.abspath(__file__))
rows = json.load(open(os.path.join(HERE, "results.json")))["rows"]
fig, ax = plt.subplots(1, 2, figsize=(9, 3.4))
for k, (key, lab) in enumerate((("area_um2", "synthesised area / OS area"), ("clk_fj_per_cycle", "accumulator clock-pin energy / OS"))):
    base = {r["P"]: r[key] for r in rows if r["B"] == 16 and r["mode"] == 0}
    for mode, name, st in ((1, "WS ungated", "o-"), (2, "WS gate/accumulator", "s-"), (3, "WS gate/set", "^-")):
        pts = sorted((r["P"], r[key] / base[r["P"]]) for r in rows if r["mode"] == mode and r["B"] == 16)
        ax[k].plot([p[0] for p in pts], [p[1] for p in pts], st, label=name)
    ax[k].set_xscale("log", base=2); ax[k].set_xlabel("lanes P (layer 64x70, B = 8)"); ax[k].set_ylabel(lab); ax[k].grid(alpha=.3)
ax[0].legend(fontsize=8)
fig.tight_layout(); fig.savefig(os.path.join(HERE, "gatedlanes.png"), dpi=130)
