"""Milestone 7ae figure. Left: each design's median rise time to 90% of a 1 m step against its median overshoot (full simulator,
36 ms law, 64 episodes): 7ac's 125 ms-ceiling designs flown with the integrator always on and with conditional integration at
b = 0.25 m, and the same training rerun with the band on (cint25, flown at b = 0.25 m). Right: their decoded outer-loop kp
against ki/kp. Writes m7ae_cint_train.png."""
import json, os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
SFX = "_smoke" if os.environ.get("SMOKE") == "1" else ""
R = json.load(open(os.path.join(HERE, f"results{SFX}.json")))
AD = json.load(open(os.path.join(HERE, "..", "m7ad_settle", "results.json")))
MID = "mid 36 ms D^0"
NEW, BASE = "aware lag39c125 cint25", "aware lag39c125"


def med(v):
    return float(np.nanmedian(np.array([np.nan if x is None else x for x in v], float)))


def step(rs, s, b):
    return {(r["geom"], r["seed"]): r for r in rs if r["set"] == s and r["band"] == b and r["test"] == "step" and r["law_name"] == MID}


sets = ((step(AD["resp"], BASE, None), {(c["geom"], c["seed"]): c for c in R["calls"]["base"]}, "trained and flown with integrator always on", "#c0392b", "o"),
        (step(AD["resp"], BASE, 0.25), {(c["geom"], c["seed"]): c for c in R["calls"]["base"]}, "same designs, band added after training", "#e08e0b", "^"),
        (step(R["resp"], NEW, 0.25), {(c["geom"], c["seed"]): c for c in R["calls"]["new"]}, "trained and flown with the band (b = 0.25 m)", "#1f6fb2", "s"))
fig, ax = plt.subplots(1, 2, figsize=(10, 4))
for st, calls, lab, c, m in sets:
    ks = sorted(st)
    ax[0].scatter([100 * med(st[k]["over"]) for k in ks], [med(st[k]["rise"]) for k in ks], s=18, c=c, marker=m, label=lab, alpha=0.85)
for st, calls, lab, c, m in (sets[0], sets[2]):
    ks = sorted(calls)
    ax[1].scatter([calls[k]["ki"] / calls[k]["kp"] for k in ks], [calls[k]["kp"] for k in ks], s=18, c=c, marker=m, label=lab.split(",")[0], alpha=0.85)
ax[0].set_xlabel("overshoot on a 1 m step (cm, median over 64 flights)")
ax[0].set_ylabel("rise time to 90% (s)")
ax[0].legend(fontsize=7, frameon=False)
ax[1].set_xlabel("outer-loop ki / kp (1/s)")
ax[1].set_ylabel("outer-loop kp (1/s$^2$)")
ax[1].legend(fontsize=7, frameon=False)
for a in ax:
    a.spines[["top", "right"]].set_visible(False)
fig.tight_layout()
fig.savefig(os.path.join(HERE, f"m7ae_cint_train{SFX}.png"), dpi=130)
print("wrote", f"m7ae_cint_train{SFX}.png")
