"""Milestone 7q figure: (a) listed motor mass against maximum thrust with the inherited and fitted laws; (b) the longest endurance
each of the 48 fixed designs can be sized for under each closure (exact solve), against the 15-minute mission. Writes m7q_closure.png."""
import json, os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
C = json.load(open(os.path.join(HERE, "closure.json")))
R = json.load(open(os.path.join(HERE, "results_sizing.json")))["runs"]
fig, ax = plt.subplots(1, 2, figsize=(10, 4))
m = C["motor"]["motors"]
for src, mk, col in (("sunnysky bench", "o", "#3b6ea8"), ("FPV listing", "s", "#c8702a")):
    t = np.array([x["tmax_g"] for x in m if x["src"] == src]); w = np.array([x["weight_g"] for x in m if x["src"] == src])
    ax[0].loglog(t * 9.81 / 1000, w, mk, color=col, ms=5, label=f"{src} ({len(t)})", alpha=0.85)
T = np.geomspace(3, 90, 50)
ax[0].loglog(T, 1000 * 0.045 * (T / 9) ** 1.2, "k--", label="inherited 0.045 (T/9 N)^1.2")
ax[0].loglog(T, 1000 * C["motor"]["k"] * (T / 9) ** C["motor"]["exp"], "k-", label=f"fit {C['motor']['k']:.4f} (T/9 N)^{C['motor']['exp']:.2f}")
ax[0].set_xlabel("maximum thrust per motor (N)"); ax[0].set_ylabel("motor mass (g)"); ax[0].legend(fontsize=7, frameon=False)
ax[0].set_title("(a) motor mass: listed against the inherited law", fontsize=9)
names = ["inh", "bat", "eff", "mot", "src", "src_li"]
for i, n in enumerate(names):
    e = np.array([r[f"own_{n}_emax"] for r in R])
    ax[1].plot(i + (np.random.default_rng(i).random(len(e)) - 0.5) * 0.4, e, "o", ms=3, color="#3b6ea8", alpha=0.7)
ax[1].axhline(15, color="k", lw=1, ls="--"); ax[1].text(5.45, 15.2, "mission 15 min", fontsize=7, ha="right")
ax[1].set_xticks(range(len(names))); ax[1].set_xticklabels(["inherited", "LiPo\n132 Wh/kg", "FM·η\n0.426", "motor\nfit", "all three\n(LiPo)", "all three\n(Li-ion)"], fontsize=7)
ax[1].set_ylabel("longest endurance that closes (min)")
ax[1].set_title("(b) 48 tuned designs: does a 15-min vehicle exist?", fontsize=9)
for a in ax:
    a.spines[["top", "right"]].set_visible(False)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "m7q_closure.png"), dpi=130)
print("wrote m7q_closure.png")
