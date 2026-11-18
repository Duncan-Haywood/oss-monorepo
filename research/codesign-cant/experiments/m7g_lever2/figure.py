"""Figure for milestone 7g: held-out flights that diverged (of 384 per set) at twice the trained centre-of-pressure lever under one
probe at a time, at the 20 and 45 deg tilt-command limits, for the margin-constrained `above` designs (pooled M = 1.25, 1.43, 1.67;
of 1,152), the unconstrained `above` designs and the constrained `below` designs (of 384 each). Reads results.json and
headroom.json (the airmode and torque-room probes are post hoc)."""
import json, os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
runs = json.load(open(os.path.join(HERE, "results.json")))["runs"] + json.load(open(os.path.join(HERE, "headroom.json")))["runs"]
PROBES = ["base", "dead85", "pos gains x0.5", "airmode", "airmode, 1.5x torque", "ideal mixer", "ideal mixer, 1.25x torque", "ideal mixer, 1.5x torque"]
NAMES = ["base", "dead bound 85°", "position gains ×0.5", "airmode mixer", "airmode, 1.5× torque", "ideal mixer",
         "ideal mixer, 1.25× torque", "ideal mixer, 1.5× torque"]
SETS = (("above", ("M=1.25", "M=1.43", "M=1.67"), "#1f77b4", "above, constrained (of 1,152)"),
        ("above", ("unconstrained",), "#ff7f0e", "above, unconstrained (of 384)"),
        ("below", ("M=1.25",), "#2ca02c", "below, constrained (of 384)"))


def count(geom, labs, cap, probe):
    alias = {"ideal mixer": "ideal mixer, 1x torque"}
    o = next(r for r in runs if r["geom"] == geom and r["cap"] == cap and r["probe"] in (probe, alias.get(probe, probe)))
    i = [k for k, l in enumerate(o["labels"]) if l in labs]
    return int(np.asarray(o["dead"])[i].sum())


fig, ax = plt.subplots(1, 2, figsize=(12, 4.6), sharey=True)
y = np.arange(len(PROBES))
for a, cap in zip(ax, (20.0, 45.0)):
    for j, (geom, labs, col, name) in enumerate(SETS):
        a.barh(y + (j - 1) * 0.27, [count(geom, labs, cap, p) for p in PROBES], height=0.27, color=col, label=name)
    a.set_yticks(y); a.set_yticklabels(NAMES); a.invert_yaxis()
    a.set_xlabel("held-out flights diverged at lever 2")
    a.set_title(f"{cap:g}° tilt-command limit")
ax[1].legend(fontsize=8, loc="upper right")
fig.tight_layout()
fig.savefig(os.path.join(HERE, "m7g_lever2.png"), dpi=130)
print("wrote m7g_lever2.png")
