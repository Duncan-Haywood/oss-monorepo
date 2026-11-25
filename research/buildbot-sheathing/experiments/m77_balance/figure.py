"""Figure for milestone 77: python experiments/m77_balance/figure.py (reads results.json and milestone 76's).

Mean re-zeros per 100 sheets at a 1% wall risk against the noise of one free-air bias reading a sheet: BALANCE (a wall
risk budget spread over the tracked residual's tares, solid), milestone 76's TRACK (one per-sheet risk level, dashed) and
milestone 75's open-loop optimum (dotted, flat), at D1 = 0.2 N, where the two differ most; G1 left, H1 right."""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
R76 = json.load(open(os.path.join(HERE, "..", "m76_closedloop", "results.json")))
PLANS = (("LAYOUT", "C0"), ("BANDS k+0", "C2"), ("BEST", "C3"))
D1 = 0.2
S = R["noise"]
xs = [max(s, 0.002) for s in S]
fig, axes = plt.subplots(1, 2, figsize=(10.5, 4.2), sharey=True)
for ax, n in zip(axes, ("g1", "h1")):
    for plan, col in PLANS:
        k = f"{n}|{plan}|{D1}"
        b = [max(R["rows"][k][str(s)]["fresh"][1], 0.3) if R["rows"][k][str(s)] else float("nan") for s in S]
        t = [max(R76["rows"][k][f"TRACK|{s}"]["fresh"][1], 0.3) for s in S]
        ax.plot(xs, b, color=col, ls="-", marker="o", ms=3, label=f"{plan}: BALANCE (m77)")
        ax.plot(xs, t, color=col, ls="--", marker="x", ms=3, label=f"{plan}: TRACK (m76)")
        ax.plot(xs, [max(R76["rows"][k]["OPT"], 0.3)] * len(S), color=col, ls=":", label=f"{plan}: open-loop optimum")
    ax.set_xscale("log")
    ax.set_yscale("log")
    ax.set_xticks(xs, ["0"] + [f"{v:g}" for v in S[1:]])
    ax.minorticks_off()
    ax.set_xlabel("reading noise s a axis, N (0 drawn at 0.002; swept)")
    ax.set_title(f"{n.upper()}: re-zeros per 100 sheets, 1% wall risk, D1 = {D1} N")
    ax.grid(alpha=0.3, which="both")
axes[0].set_ylabel("mean re-zeros (0 drawn at 0.3)")
axes[1].legend(fontsize=6.5, loc="center right")
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=130)
