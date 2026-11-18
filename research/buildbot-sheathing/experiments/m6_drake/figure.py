"""Figure for milestone 6 (Drake sim-to-sim) from results.json:  python experiments/m6_drake/figure.py"""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
r = json.load(open(os.path.join(HERE, "results.json")))
fig, ax = plt.subplots(1, 3, figsize=(14, 4))

# A. press thresholds against wall friction: closed form, MuJoCo, Drake
for lay, mk in (("corners", "o"), ("studs", "s")):
    b = [x for x in r["B"] if x["layout"] == lay]
    mu = [x["mu"] for x in b]
    ax[0].plot(mu, [x["closed"] for x in b], "-", color="0.5" if lay == "corners" else "0.75",
               lw=1, label=f"closed form, {lay}")
    ax[0].plot(mu, [x["mujoco"] for x in b], mk, mfc="none", color="C0", label=f"MuJoCo, {lay}")
    ax[0].plot(mu, [x["drake"] for x in b], mk, ms=3.5, color="C3", label=f"Drake SAP, {lay}")
ax[0].set(xlabel="wall friction μ", ylabel="least press that holds a 1° error (N)",
          title="A. Press threshold F_n*: when wall friction\nstops the ledger seating the sheet")
ax[0].legend(fontsize=7)

# B. clean sheets: Drake against MuJoCo, every milestone-5 ledger pipeline
c = r["F_clean"]
for fr, col in (("2x", "C3"), ("2x2x", "C0")):
    xs = [x["mujoco"] for x in c if x["framing"] == fr]
    ys = [x["drake"] for x in c if x["framing"] == fr]
    ax[1].plot(xs, ys, "o", ms=5, mfc="none", color=col,
               label="single 2x joint" if fr == "2x" else "two 2x at the joint")
g = np.linspace(0, 1, 2)
ax[1].plot(g, g, "k-", lw=0.8)
ax[1].fill_between(g, g - 0.1, g + 0.1, color="0.9", label="±10 points (H-E)")
ax[1].set(xlim=(0, 1.02), ylim=(0, 1.02), xlabel="first-pass clean sheets, MuJoCo seat",
          ylabel="first-pass clean sheets, Drake seat",
          title="B. Clean sheets with each simulator's\nseated residual (24 pipelines)")
ax[1].legend(fontsize=7, loc="upper left")

# C. slide tip heights
gg = r["G"]
for fn, mk in ((50.0, "o"), (100.0, "s")):
    s = [x for x in gg if x["f_n"] == fn]
    ax[2].plot([x["mu_l"] for x in s], [x["mujoco"] for x in s], mk, mfc="none", color="C0",
               label=f"MuJoCo, F_n {fn:.0f} N")
    ax[2].plot([x["mu_l"] for x in s], [x["drake"] if x["drake"] is not None else np.nan for x in s], mk,
               ms=3.5, color="C3", label=f"Drake, F_n {fn:.0f} N")
mus = np.linspace(0.3, 0.7, 50)
ax[2].plot(mus, 1.2192 / (2 * mus), "k-", lw=0.8, label="closed form W/(2μ_l)")
ax[2].set(xlabel="ledger friction μ_l", ylabel="push height that tips the sheet (m)",
          title="C. Sliding along the ledger:\nhow high may the robot push?")
ax[2].legend(fontsize=7)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=110)
