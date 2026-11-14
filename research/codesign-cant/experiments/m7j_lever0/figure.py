"""Figure for milestone 7j. Left: held-out flights that diverged at lever 0 (no gust torque), of 384 per set, against the
tilt-command limit, centre of pressure above. Right: at 45 deg, the three retrained `above` sets' diverged flights (24 in base)
under one change at a time. Reads results.json."""
import json, os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
SETS = (("7e", "7e: lever 1, TWR 2", "#1f77b4", "o"), ("7h free", "7h: lever 1, TWR free", "#2ca02c", "^"),
        ("aware TWR=2.0", "7i: levers 0-2, TWR 2", "#ff7f0e", "s"), ("aware TWR free", "7i: levers 0-2, TWR free", "#d62728", "D"))
get = lambda c, l, p: next(o for o in R["runs"] if o["geom"] == "above" and o["cap"] == c and o["lever"] == l and o["probe"] == p)
count = lambda o, lab: int(np.asarray(o["dead"])[[k for k, x in enumerate(o["labels"]) if x == lab]].sum())
fig, ax = plt.subplots(1, 2, figsize=(12, 4.6))
caps = (30.0, 35.0, 40.0, 45.0)
for lab, name, col, mk in SETS:
    ax[0].plot(caps, [count(get(c, 0.0, "base"), lab) for c in caps], marker=mk, color=col, label=name)
ax[0].axvline(30, color="grey", ls=":", lw=1); ax[0].text(30.3, 11.5, "ArduPilot ANGLE_MAX default", fontsize=7, color="grey")
ax[0].axvline(45, color="grey", ls=":", lw=1); ax[0].text(44.7, 11.5, "PX4 MPC_TILTMAX_AIR default", fontsize=7, color="grey", ha="right")
ax[0].set_xlabel("tilt-command limit (deg)"); ax[0].set_ylabel("held-out flights diverged at lever 0 (of 384)")
ax[0].set_title("No gust torque (lever 0), centre of pressure above"); ax[0].legend(fontsize=8)
probes = [p for p in R["probes"]]
retr = [s[0] for s in SETS[1:]]
v = [sum(count(get(45.0, 0.0, p), lab) for lab in retr) for p in probes]
ax[1].barh(range(len(probes))[::-1], v, color=["#555555"] + ["#9467bd"] * (len(probes) - 1))
for i, vi in zip(range(len(probes))[::-1], v):
    ax[1].text(vi + 0.2, i, str(vi), va="center", fontsize=8)
ax[1].set_yticks(range(len(probes))[::-1]); ax[1].set_yticklabels(probes)
ax[1].set_xlabel("diverged flights, three retrained sets, 45°, lever 0 (of 1,152)")
ax[1].set_title("45°, lever 0: one change at a time")
fig.tight_layout()
fig.savefig(os.path.join(HERE, "m7j_lever0.png"), dpi=130)
print("wrote m7j_lever0.png")
