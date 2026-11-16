"""Milestone 7r figure: per-seed mass against lever-2, 45 deg crashes (cap) for the published designs (inherited closure), the same
designs on the sourced Li-ion closure (not retuned), and designs retuned on it. Writes m7r_retune.png."""
import json, os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))["runs"]
STY = {"7l t45 cap wide [inh60]": ("7l, published (inherited closure)", "o", "#9aa5b1", "none"),
       "aware cap wide [inh60]": ("lever-aware, published (inherited closure)", "s", "#9aa5b1", "none"),
       "7l t45 cap wide [src_li]": ("7l, sourced Li-ion, not retuned", "o", "#c8702a", "none"),
       "aware cap wide [src_li]": ("lever-aware, sourced Li-ion, not retuned", "s", "#c8702a", "none"),
       "7l src_li [src_li]": ("7l objective, retuned on sourced Li-ion", "o", "#3b6ea8", "#3b6ea8"),
       "aware src_li [src_li]": ("lever-aware, retuned on sourced Li-ion", "s", "#2e8b57", "#2e8b57")}
fig, ax = plt.subplots(1, 2, figsize=(10, 4), sharey=True)
for a, g in zip(ax, ("above", "below")):
    for lab, (name, mk, col, fc) in STY.items():
        x = [r for r in R if r["label"] == lab and r["geom"] == g]
        a.plot([r["mass"] for r in x], [r["dead_45_2_cap"] for r in x], mk, ms=6, mec=col, mfc=fc, label=name, alpha=0.9)
    a.set_title(f"centre of pressure {g} the centre of mass", fontsize=9)
    a.set_xlabel("sized all-up mass (kg)")
    a.spines[["top", "right"]].set_visible(False)
ax[0].set_ylabel("diverged flights of 64 (lever 2, 45°, cap)")
ax[1].legend(fontsize=7, frameon=False, loc="upper right")
fig.tight_layout()
fig.savefig(os.path.join(HERE, "m7r_retune.png"), dpi=130)
print("wrote m7r_retune.png")
