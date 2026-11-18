"""Milestone 7s figure: diverged flights at lever 2, 45 deg (cap, of 384 per set) against each set's mean motor lag, under the nine
lag laws, one line per design set. Writes m7s_lag.png."""
import json, os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
STY = {"7l t45 cap wide [inh60]": ("7l, published (inherited closure)", "o", "#9aa5b1"),
       "aware cap wide [inh60]": ("lever-aware, published (inherited closure)", "s", "#6b7682"),
       "7l t45 cap wide [src_li]": ("7l, sourced Li-ion, not retuned", "o", "#c8702a"),
       "aware cap wide [src_li]": ("lever-aware, sourced Li-ion, not retuned", "s", "#e0a060"),
       "7l src_li [src_li]": ("7l objective, retuned on sourced Li-ion", "o", "#3b6ea8"),
       "aware src_li [src_li]": ("lever-aware, retuned on sourced Li-ion", "s", "#2e8b57")}
fig, ax = plt.subplots(1, 2, figsize=(10, 4.2), sharey=True)
for a, g in zip(ax, ("above", "below")):
    for s, (nm, mk, col) in STY.items():
        pts = []
        for law in R["laws"]:
            rs = [r for r in R["runs"] if r["set"] == s and r["geom"] == g and r["law"] == law]
            pts.append((1000 * sum(r["lag_s"] for r in rs) / len(rs), sum(r["dead_45_2_cap"] for r in rs)))
        pts.sort()
        a.plot([p[0] for p in pts], [p[1] for p in pts], mk + "-", ms=4, color=col, lw=1, label=nm, alpha=0.9)
    a.axvspan(11.4, 16.2, color="#888", alpha=0.08, lw=0)
    a.set_title(f"centre of pressure {g} the centre of mass", fontsize=9)
    a.set_xlabel("motor lag at the design's propeller (ms), nine laws")
    a.spines[["top", "right"]].set_visible(False)
ax[0].set_ylabel("diverged flights of 384 (lever 2, 45°, cap)")
ax[1].legend(fontsize=7, frameon=False, loc="lower right")
fig.tight_layout()
fig.savefig(os.path.join(HERE, "m7s_lag.png"), dpi=130)
print("wrote m7s_lag.png")
