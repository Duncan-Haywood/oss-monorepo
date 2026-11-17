"""Milestone 7p figure: (left) listed frame weights against wheelbase with the inherited and fitted laws; (middle, right) the lever-1
(7l) designs' lever-2, 45 deg crashes against arm length under each frame law, drawn where all six seeds are valid."""
import csv, json, os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, "results.json")))
LAW = json.load(open(os.path.join(HERE, "frame_law.json")))
rows = list(csv.DictReader(open(os.path.join(HERE, "..", "..", "data", "frames", "frames_hobbyrc.csv"))))
COL = {"inh": "#7f7f7f", "fam": "#2ca02c", "xb": "#c0603a", "xb_abs": "#3b6ea8"}
NAME = {"inh": "inherited, 0.80 kg/m", "fam": "one design stretched, 0.51 kg/m", "xb": "cross-brand slope, 2.27 kg/m", "xb_abs": "cross-brand law (lighter at own L)"}

fig, axs = plt.subplots(1, 3, figsize=(15, 4.4))
ax = axs[0]
for r in rows:
    w, m = float(r["wheelbase_mm"]), float(r["weight_g"])
    fam = r["family"] in ("geprc-mark4", "foxeer-aura-v2-pro")
    ax.plot(w, m, "o" if r["use"] == "fit" else "x", color="#2ca02c" if fam else "#555555", ms=4, alpha=0.8)
W = np.linspace(150, 350, 50)
ax.plot(W, 50 + 0.4 * W, color=COL["inh"], label="inherited 0.05 + 0.8 L")
cb = LAW["cross_brand"]
ax.plot(W, cb["a_g"] + cb["b_g_per_mm"] * W, color=COL["xb"], label=f"cross-brand fit, {cb['n']} frames")
k = LAW["family_strict"]["k_g_per_mm"]
ax.plot(W, 102 + k * (W - 225), color=COL["fam"], ls="--", label="one design stretched (Mark4 slope)")
ax.axvspan(170, 300, color="#dddddd", alpha=0.4, lw=0)
ax.set_xlabel("wheelbase W = 2L (mm)"); ax.set_ylabel("listed frame weight (g)"); ax.set_xlim(150, 350); ax.set_ylim(0, 400)
ax.set_title("frame weight: listed frames (green: Mark4, Aura V2 Pro)", fontsize=10); ax.legend(fontsize=7, frameon=False)
for ax, g in zip(axs[1:], ("above", "below")):
    rs = [r for r in D["runs"] if r["label"] == "7l t45 cap wide" and r["geom"] == g]
    for m in D["modes"]:
        xs, ys = [], []
        for L in D["grid"]:
            i = [r["L"].index(L) for r in rs]
            if all(r[f"{m}_rho"][j] < 1.0 and r[f"{m}_feasible"][j] for r, j in zip(rs, i)):
                xs.append(L * 1000); ys.append(sum(r[f"dead_{m}_45_2"][j] for r, j in zip(rs, i)))
        ax.plot(xs, ys, "-o", ms=3, color=COL[m], label=NAME[m])
    ax.axhline(53 if g == "above" else 52, color="k", lw=0.6, ls=":")
    ax.set_xlabel("frame arm L (mm)"); ax.set_ylabel("diverged of 384, lever 2, 45°, cap")
    ax.set_title(f"lever-1 designs, centre of pressure {g}; dotted: lever-aware designs", fontsize=9)
axs[1].legend(fontsize=7, frameon=False)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "m7p_frame_law.png"), dpi=130)
