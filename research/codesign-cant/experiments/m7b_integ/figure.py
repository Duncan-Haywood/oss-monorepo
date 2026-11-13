"""Figure for milestone 7b: late-window position error on the hurt and helped axes (left), diverged held-out episodes at lever 1
and 2 (middle), and composite J of the integrator feed-forward designs against milestone 6b, milestone 7 and no cant (right).
Reads results.json."""
import json, os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
d = json.load(open(os.path.join(HERE, "results.json")))
runs = d["runs"]
EP = 64
COL = {"above": "#1f77b4", "below": "#d62728"}
NAME = {"above": "centre of pressure above CoM", "below": "centre of pressure below CoM"}
HURT = {"above": ("latey", "latex"), "below": ("latex", "latey")}
ARMS = (("6b aware", "no feed-forward\n(6b)"), ("m7 cmd-ff", "commanded-torque\nfeed-forward (m7)"),
        ("6b+integ", "integrator ff,\nnot retrained"), ("integ retrained", "integrator ff,\nretrained"))


def sel(g, lab):
    return sorted((r for r in runs if r["geom"] == g and r["label"] == lab), key=lambda r: r["seed"])


fig, ax = plt.subplots(1, 3, figsize=(14, 4.3))
rng = np.random.default_rng(0)
for k, g in enumerate(("above", "below")):
    hu, he = HURT[g]
    for i, (lab, _) in enumerate(ARMS):
        rs = sel(g, lab)
        for j, key in enumerate((hu, he)):
            v = np.array([r[f"{key}_1_on"] for r in rs]); x = i + (k - 0.5) * 0.4 + (j - 0.5) * 0.16
            ax[0].scatter(x + rng.uniform(-0.03, 0.03, len(v)), v, s=14, color=COL[g], marker="o" if j == 0 else "s",
                          alpha=0.9 if j == 0 else 0.35, label=(f"{NAME[g]}: hurt axis" if j == 0 else f"{NAME[g]}: helped axis") if i == 0 else None)
            ax[0].hlines(np.median(v), x - 0.06, x + 0.06, color="k", lw=1.4)
        for m, lev in enumerate(("1", "2")):
            tot = sum(int(round(r[f"dead_{lev}_on"] * EP)) for r in rs)
            x = i + (k - 0.5) * 0.4 + (m - 0.5) * 0.18
            ax[1].bar(x, tot, width=0.16, color=COL[g], alpha=0.9 if m == 0 else 0.4,
                      label=f"{NAME[g]}, lever {lev}" if i == 0 else None)
    rr = sel(g, "integ retrained")
    for i, cmp in enumerate(("6b aware", "m7 cmd-ff", "6b nocant")):
        b = sel(g, cmp)
        dj = np.array([x["J_1_on"] - y["J_1_on"] for x, y in zip(rr, b)])
        xx = i + (k - 0.5) * 0.3
        ax[2].scatter(xx + rng.uniform(-0.04, 0.04, len(dj)), dj, s=18, color=COL[g], label=NAME[g] if i == 0 else None)
        ax[2].hlines(np.median(dj), xx - 0.08, xx + 0.08, color="k", lw=1.4)
for a in ax[:2]:
    a.set_xticks(range(len(ARMS))); a.set_xticklabels([x[1] for x in ARMS], fontsize=7.5)
ax[0].set_ylabel("late-window (3–6 s) position RMS (m)"); ax[0].set_yscale("log")
ax[0].set_title("Hurt vs helped axis after the wind step (lever 1)"); ax[0].legend(frameon=False, fontsize=6.5)
ax[1].set_ylabel(f"diverged held-out episodes (6 seeds × {EP})"); ax[1].set_title("Divergences (solid: lever 1, light: lever 2)")
ax[1].legend(frameon=False, fontsize=6.5)
ax[2].axhline(0, color="k", lw=0.6); ax[2].set_xticks([0, 1, 2])
ax[2].set_xticklabels(["minus 6b\n(no feed-forward)", "minus m7\n(commanded-torque ff)", "minus 6b\nno cant"], fontsize=7.5)
ax[2].set_ylabel("J difference (above 0: integrator-ff design better)"); ax[2].set_title("Retrained with the integrator ff (paired, lever 1)")
ax[2].legend(frameon=False, fontsize=7)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "m7b_integ.png"), dpi=150)
print("wrote m7b_integ.png")
