"""Milestone 7ad figure. Left: each design's distance from the hold point over the last second of a 1 m step (full simulator,
36 ms law, median over 64 episodes) against its outer-loop ki/kp; 7ac's 72 designs with the integrator always on (b = None) and
with conditional integration at b = 0.25 m, and the 96 never-tested designs (b = None). Right: the three-state model's
last-second distance against the simulator's, for the same 168 designs at b = None. The 5 cm settle band is dashed.
Writes m7ad_settle.png."""
import json, os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
MID = "mid 36 ms D^0"


def k(r):
    return (r["set"], r["geom"], r["seed"])


def med(v):
    return float(np.nanmedian(np.array([np.nan if x is None else x for x in v], float)))


calls = {k(c): c for c in R["calls"]["held"] + R["calls"]["base"]}
held = [r for r in R["resp_held"] if r["test"] == "step" and r["law_name"] == MID]
base = {b: [r for r in R["resp"] if r["test"] == "step" and r["law_name"] == MID and r["band"] == b] for b in (None, 0.25)}
fig, ax = plt.subplots(1, 2, figsize=(10, 4))
for rs, lab, kw in ((base[None], "7ac designs, integrator always on", dict(c="#c0392b", marker="o")),
                    (held, "96 untested designs, always on", dict(c="#e08e0b", marker="^")),
                    (base[0.25], "7ac designs, conditional integration (b = 0.25 m)", dict(c="#1f6fb2", marker="s"))):
    ax[0].scatter([calls[k(r)]["ki"] / calls[k(r)]["kp"] for r in rs], [100 * med(r["tail_off"]) for r in rs], s=14, label=lab,
                  alpha=0.8, **kw)
ax[0].axhline(5, ls="--", c="0.5", lw=1)
ax[0].set_xlabel("outer-loop ki / kp (1/s)")
ax[0].set_ylabel("distance from hold point, last second (cm)")
ax[0].legend(fontsize=7, frameon=False)
for rs, lab, kw in ((base[None], "7ac designs (in sample)", dict(c="#c0392b", marker="o")),
                    (held, "96 untested designs", dict(c="#e08e0b", marker="^"))):
    ax[1].scatter([100 * calls[k(r)]["model_tail"] for r in rs], [100 * med(r["tail_off"]) for r in rs], s=14, label=lab, alpha=0.8, **kw)
m = max(ax[1].get_xlim()[1], ax[1].get_ylim()[1])
ax[1].plot([0, m], [0, m], c="0.7", lw=1)
ax[1].axhline(5, ls="--", c="0.5", lw=1); ax[1].axvline(5, ls="--", c="0.5", lw=1)
ax[1].set_xlabel("three-state outer-loop model (cm)")
ax[1].set_ylabel("full simulator (cm)")
ax[1].legend(fontsize=7, frameon=False)
for a in ax:
    a.spines[["top", "right"]].set_visible(False)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "m7ad_settle.png"), dpi=130)
print("wrote m7ad_settle.png")
