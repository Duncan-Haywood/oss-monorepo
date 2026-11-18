"""Figure for milestone 3 (ledger) from results.json:  python experiments/m3_ledger/figure.py"""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
r = json.load(open(os.path.join(HERE, "results.json")))
fig, ax = plt.subplots(1, 3, figsize=(14, 4))

# A. tilt left against press, theta0 = 1 deg, by wall friction; predicted thresholds dashed
mus = sorted({x["mu"] for x in r["A"]})
for i, mu in enumerate(mus):
    pts = sorted((x["f_n"], x["theta_deg"]) for x in r["A"] if x["mu"] == mu and x["theta0_deg"] == 1.0)
    ax[0].plot([p[0] for p in pts], [p[1] for p in pts], "o-", ms=3, color=f"C{i}", label=f"μ = {mu}")
    pred = next(b["pred"] for b in r["B"] if b["layout"] == "corners" and b["mu"] == mu)
    ax[0].axvline(pred, color=f"C{i}", ls=":", lw=1)
ax[0].set(xlabel="press against the wall F_n (N)", ylabel="tilt left after seating (deg)",
          title="A. Released onto the ledger from 1° off\n(dotted: predicted μF_n r̄ = m g W/2)")
ax[0].legend(fontsize=7)

# B. held wrist: MuJoCo against the closed form
c = r["C"]
for fn, mk in ((5, "o"), (100, "s")):
    xs = [x["pred_deg"] for x in c if x["f_n"] == fn]
    ys = [x["sim_deg"] for x in c if x["f_n"] == fn]
    ax[1].plot(xs, ys, mk, ms=5, mfc="none", label=f"F_n = {fn} N")
ax[1].plot([0, 2], [0, 2], "k-", lw=0.8)
ax[1].set(xlabel="closed form max(0, θ0 − (mgW/2 − μF_n r̄)/k) (deg)", ylabel="MuJoCo tilt left (deg)",
          title="B. A wrist that keeps its stiffness k\nholds part of its own error (μ 0.4)")
ax[1].legend(fontsize=7)

# C. clean sheets with a ledger hang
f = r["F"]["clean"]
fr = f["2x straight"]["panel_frac"]
for i, (sc, row) in enumerate(zip(f["2x straight"]["s_corner_mm"], f["2x straight"]["clean"])):
    ax[2].plot(fr, row, "o-", ms=3, color=plt.cm.viridis(i / 4), label=f"single 2x, ledger σ {sc} mm")
wide = f["2 x 2x low warp"]["clean"]
ax[2].plot(fr, [min(col) for col in zip(*wide)], "k--", lw=1.5, label="two 2x, low warp (worst ledger)")
ax[2].axhline(0.95, color="grey", lw=0.8, ls=":")
ax[2].set(xlabel="panel squareness and edge bow, fraction of the PS 2 limits",
          ylabel="clean sheets (all 62 nails in)", ylim=(0.6, 1.01),
          title="C. Clean sheets with a ledger hang\n(three reads, edge aim, tacked)")
ax[2].legend(fontsize=6, loc="lower left")
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=130)
