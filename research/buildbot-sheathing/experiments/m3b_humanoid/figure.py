"""Figure for milestone 3, second part, from results.json: python experiments/m3b_humanoid/figure.py"""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
fig, ax = plt.subplots(1, 3, figsize=(14, 4.2))

a = [r for r in R["A"] if r["h_press"] is None and r["f_n"] == 50.0]
mus = [r["mu_l"] for r in a]
ax[0].plot(mus, [r["h_closed"] for r in a], "-", color="0.3", label="closed form W / (2 mu_l)")
ax[0].plot(mus, [r["h_sim"] for r in a], "o", color="C0", label="MuJoCo, F_n 50 N")
b = [r for r in R["A"] if r["h_press"] is None and r["f_n"] == 100.0]
ax[0].plot([r["mu_l"] for r in b], [r["h_sim"] for r in b], "x", color="C3", label="MuJoCo, F_n 100 N")
ax[0].set_xlabel("ledger friction mu_l")
ax[0].set_ylabel("push height that tips the sheet (m)")
ax[0].set_title("(a) slide along the ledger: push below h*")
ax[0].legend(fontsize=8)

for n, c in (("g1", "C0"), ("h1", "C1")):
    rows = [r for r in R["B"] if r["robot"] == n and r["mu_foot"] == 0.6 and r["x"] == 0.3]
    z = [r["z"] for r in rows]
    ax[1].plot(z, [r["press"] for r in rows], "-o", color=c, label=f"{n.upper()} press only")
    ax[1].plot(z, [r["slide03"] or 0 for r in rows], "--s", color=c, label=f"{n.upper()} press + slide, mu_l 0.3")
    ax[1].plot(z, [r["slide05"] or 0 for r in rows], ":^", color=c, label=f"{n.upper()} press + slide, mu_l 0.5")
ax[1].axhline(50, color="0.5", lw=0.8)
ax[1].set_xlabel("hand height (m), reach 0.3 m, foot friction 0.6")
ax[1].set_ylabel("largest press into the wall (N; 0 = infeasible)")
ax[1].set_title("(b) whole-body static limit, sheet on the ledger")
ax[1].legend(fontsize=7)

c = [r for r in R["C"] if r["variant"] == "stock" and r["z"] == 1.0]
labels = [f"{r['robot'].upper()} {r['grip']}" for r in c]
ax[2].bar(labels, [r["K_corner"] for r in c], color=["C0", "C0", "C1", "C1"])
lim = c[0]["K_corner"] * c[0]["kp_scale_star"]
ax[2].axhline(lim, color="C3", label=f"part-one limit at 1 deg ({lim:.0f})")
ax[2].set_yscale("log")
ax[2].set_ylabel("sheet stiffness about the landing corner (N m/rad)")
ax[2].set_title("(c) stock joint gains, hands at 1.0 m")
ax[2].legend(fontsize=8)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=130)
print("wrote figure.png")
