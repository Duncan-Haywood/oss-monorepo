"""Milestone 7ai figure. Left: the no-flight lag (box-mean linear model) against the flown one, per design, for the area estimate
and the 63% time (A = 1 m/s^2, 36 ms law). Right: the achieved acceleration after the request step for the median-lag design,
flown and linear, with and without the side force. Writes m7ai_lag_model.png."""
import os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import verdicts as W

HERE = os.path.dirname(os.path.abspath(__file__))
ft, bt = W.flown("base", "tau", 1.0) * 1e3, W.lin("box", "tau", 1.0) * 1e3
f63, b63 = W.flown("base", "t63", 1.0) * 1e3, W.lin("box", "t63", 1.0) * 1e3
fig, (ax, bx) = plt.subplots(1, 2, figsize=(11, 4.4))
ax.plot(ft, bt, "o", ms=5, label="area estimate")
ax.plot(f63, b63, "s", ms=4, mfc="none", label="63% time")
lo, hi = 0, 320
ax.plot([lo, hi], [lo, hi], "k--", lw=1, label="equal")
ax.set_xlim(lo, hi); ax.set_ylim(lo, hi)
ax.set_xlabel("lag read off a flown acceleration step (ms, median of 64)"); ax.set_ylabel("lag from the linear model, no flight (ms)")
ax.set_title("36 designs, 1 m/s² step, 36 ms law (simulated)"); ax.legend(fontsize=8); ax.grid(alpha=0.3)
i = int(np.argsort(ft)[len(ft) // 2]); k = W.KEYS[i]
for var, lab in (("base", "flown"), ("nolat", "flown, side force off")):
    y = np.array(W.FL[(k, var, 1.0)]["mean_resp"], float); t = (np.arange(len(y)) * 5 + 1) * 0.002
    bx.plot(t, y, lw=2, alpha=0.7, label=lab)
for m, lab in (("box", "linear"), ("box_nolat", "linear, lat = 0")):
    y = np.array(W.LIN[k][f"{m}_1"]["resp"], float); t = (np.arange(len(y)) * 5 + 1) * 0.002
    bx.plot(t, y, "--", lw=1.2, label=lab)
bx.set_xlim(0, 1.0); bx.set_xlabel("time after the request step (s)"); bx.set_ylabel("achieved / steady acceleration")
bx.set_title(f"median-lag design ({k[1]}), area lag {ft[i]:.0f} ms"); bx.legend(fontsize=8, loc="lower right"); bx.grid(alpha=0.3)
fig.tight_layout(); fig.savefig(os.path.join(HERE, "m7ai_lag_model.png"), dpi=130)
print("wrote m7ai_lag_model.png")
