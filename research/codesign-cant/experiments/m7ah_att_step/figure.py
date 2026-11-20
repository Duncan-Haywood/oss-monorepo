"""Milestone 7ah figure. Left: the achieved horizontal acceleration after a 3.5 m/s^2 request step, as a share of its steady
value, averaged over 64 episodes (36 ms law), for the designs with the shortest, median and longest identified lag, against the
first-order lag of the pooled median tau. Right: median |simulated - predicted| rise per 7ag condition for the no-lag point
mass, 7ag's fitted 135 ms lag, and the lags identified here (per design: area estimate and 63% time). Writes m7ah_att_step.png."""
import os, sys
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import verdicts as W  # noqa: E402

V = W.V
conds = [tuple(c) for c in V.R["conds"]]
T = {c: V.table(*c) for c in conds}
t35, t63 = W.ident("tau", 3.5), W.ident("t63", 3.5)
P = {"no lag": {c: T[c]["pm"] for c in conds}, "fitted 135 ms (7ag)": {c: W.pred(W.TAU_FIT, *c) for c in conds},
     "identified, area": {c: W.pred(t35, *c) for c in conds}, "identified, 63% time": {c: W.pred(t63, *c) for c in conds}}
fig, (ax, bx) = plt.subplots(1, 2, figsize=(11, 4.4))
rs = {V.key(r): r for r in W.R["resp"] if r["amp"] == 3.5 and r["law_name"] == W.MID}
order = np.argsort(t35)
for i, lab in ((order[0], "shortest"), (order[len(order) // 2], "median"), (order[-1], "longest")):
    k = W.KEYS[i]; y = np.array(rs[k]["mean_resp"], float); t = (np.arange(len(y)) * 5 + 1) * 0.002
    ax.plot(t, y, label=f"{lab} lag, tau {t35[i] * 1000:.0f} ms ({k[1]})")
tt = np.linspace(0, 2, 400); m = float(np.median(t35))
ax.plot(tt, 1 - np.exp(-tt / m), "k--", lw=1, label=f"first-order lag, tau {m * 1000:.0f} ms (median)")
ax.set_xlim(0, 1.0); ax.set_xlabel("time after the request step (s)"); ax.set_ylabel("achieved / steady acceleration")
ax.set_title("Acceleration step, 3.5 m/s², 36 ms law (simulated)"); ax.legend(fontsize=7.5, loc="lower right"); ax.grid(alpha=0.3)
xs = np.arange(len(conds)); w = 0.2
for j, (lab, p) in enumerate(P.items()):
    bx.bar(xs + (j - 1.5) * w, [V.mae(T[c]["sim"], p[c]) * 1000 for c in conds], w, label=lab)
bx.set_xticks(xs); bx.set_xticklabels([f"A_P {a:g}\nS {s:g}" for a, s in conds], fontsize=8)
bx.set_ylabel("median |rise error| (ms)"); bx.set_title("Rise-time prediction error, 36 designs"); bx.legend(fontsize=8); bx.grid(alpha=0.3, axis="y")
fig.tight_layout(); fig.savefig(os.path.join(HERE, "m7ah_att_step.png"), dpi=130)
print("wrote m7ah_att_step.png")
