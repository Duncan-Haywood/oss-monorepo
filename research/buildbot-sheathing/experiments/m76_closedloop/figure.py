"""Figure for milestone 76: python experiments/m76_closedloop/figure.py (reads results.json).

Mean re-zeros per 100 sheets at a 1% wall risk against the noise of one free-air bias reading a sheet: TRACK (offset
updated at each reading, solid) and READ (reading only triggers a tare, dashed), with milestone 75's open-loop
optimum (dotted, flat), at D1 = 0.1 N; G1 left, H1 right (its LAYOUT and BANDS k+0 rows coincide)."""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
PLANS = (("LAYOUT", "C0"), ("BANDS k+0", "C2"), ("BEST", "C3"))
D1 = 0.1
S = R["noise"]
xs = [max(s, 0.002) for s in S]
fig, axes = plt.subplots(1, 2, figsize=(10.5, 4.2), sharey=True)
for ax, n in zip(axes, ("g1", "h1")):
    for plan, col in PLANS:
        r = R["rows"][f"{n}|{plan}|{D1}"]
        for pol, ls in (("TRACK", "-"), ("READ", "--")):
            y = [max(r[f"{pol}|{s}"]["fresh"][1], 0.3) if r[f"{pol}|{s}"] else float("nan") for s in S]
            ax.plot(xs, y, color=col, ls=ls, marker="o", ms=3, label=f"{plan}: {pol}")
        ax.plot(xs, [max(r["OPT"], 0.3)] * len(S), color=col, ls=":", label=f"{plan}: open-loop optimum (m75)")
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
