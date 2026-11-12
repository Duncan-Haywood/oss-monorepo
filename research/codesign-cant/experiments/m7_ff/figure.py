"""Figure for milestone 7: late-window position error on the hurt and helped axes with and without the side-force feed-forward
(left), the share of held-out episodes that diverge against the feed-forward's filter constant (middle), and composite J against
milestone 6b's force-aware and no-cant designs (right). Reads results.json."""
import json, os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
d = json.load(open(os.path.join(HERE, "results.json")))
runs, TAUS = d["runs"], d["taus"]
COL = {"above": "#1f77b4", "below": "#d62728"}
NAME = {"above": "centre of pressure above CoM", "below": "centre of pressure below CoM"}
HURT = {"above": ("latey", "latex"), "below": ("latex", "latey")}


def sel(g, lab):
    return sorted((r for r in runs if r["geom"] == g and r["label"] == lab), key=lambda r: r["seed"])


fig, ax = plt.subplots(1, 3, figsize=(13.5, 4.2))
rng = np.random.default_rng(0)
arms = (("6b aware", "no feed-forward\n(6b design)"), ("6b+ff tau 1", "feed-forward\n1 s, not retrained"), ("ff retrained", "feed-forward,\nretrained"))
for k, g in enumerate(("above", "below")):
    hu, he = HURT[g]
    for i, (lab, _) in enumerate(arms):
        rs = sel(g, lab)
        for j, key in enumerate((hu, he)):
            v = np.array([r[f"{key}_1_on"] for r in rs]); x = i + (k - 0.5) * 0.4 + (j - 0.5) * 0.16
            ax[0].scatter(x + rng.uniform(-0.03, 0.03, len(v)), v, s=16, color=COL[g], marker="o" if j == 0 else "s",
                          alpha=0.9 if j == 0 else 0.35, label=(f"{NAME[g]}: hurt axis" if j == 0 else f"{NAME[g]}: helped axis") if i == 0 else None)
            ax[0].hlines(np.median(v), x - 0.06, x + 0.06, color="k", lw=1.4)
    taus = np.array(TAUS)
    dead = np.array([[r["dead_1_on"] for r in sel(g, f"6b+ff tau {t:g}")] for t in TAUS])
    base = np.mean([r["dead_1_on"] for r in sel(g, "6b aware")])
    ax[1].plot(taus * (1 + (k - 0.5) * 0.06), dead.mean(1), "-o", color=COL[g], label=f"{NAME[g]}: 6b design + feed-forward")
    ax[1].axhline(base, color=COL[g], lw=0.8, ls=":")
    rr = sel(g, "ff retrained")
    ax[1].scatter([r["tau_chosen"] for r in rr], [r["dead_1_on"] for r in rr], marker="*", s=70, color=COL[g], edgecolor="k", lw=0.4,
                  label=f"{NAME[g]}: retrained (chosen τ_ff)")
    for i, (cmp, off) in enumerate((("6b aware", -0.1), ("6b nocant", 0.1))):
        b = sel(g, cmp)
        dj = np.array([x["J_1_on"] - y["J_1_on"] for x, y in zip(rr, b)])
        xx = i + (k - 0.5) * 0.3
        ax[2].scatter(xx + rng.uniform(-0.04, 0.04, len(dj)), dj, s=18, color=COL[g], label=NAME[g] if i == 0 else None)
        ax[2].hlines(np.median(dj), xx - 0.08, xx + 0.08, color="k", lw=1.4)
ax[0].set_xticks(range(3)); ax[0].set_xticklabels([a[1] for a in arms], fontsize=8)
ax[0].set_ylabel("late-window (3–6 s) position RMS (m)"); ax[0].set_yscale("log")
ax[0].set_title("Hurt vs helped axis after the wind step (lever 1)"); ax[0].legend(frameon=False, fontsize=6.5)
ax[1].set_xscale("log"); ax[1].set_xlabel("feed-forward filter constant τ_ff (s)"); ax[1].set_ylabel("share of held-out episodes diverged")
ax[1].set_title("A fast feed-forward destabilises (dotted: no feed-forward)"); ax[1].legend(frameon=False, fontsize=6.5)
ax[2].axhline(0, color="k", lw=0.6); ax[2].set_xticks([0, 1]); ax[2].set_xticklabels(["minus 6b force-aware\n(cant, no feed-forward)", "minus 6b no cant"], fontsize=8)
ax[2].set_ylabel("J difference (above 0: feed-forward design better)"); ax[2].set_title("Retrained with the feed-forward (paired by seed)")
ax[2].legend(frameon=False, fontsize=7)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "m7_ff.png"), dpi=150)
print("wrote m7_ff.png")
