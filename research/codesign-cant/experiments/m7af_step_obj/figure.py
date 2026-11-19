"""Milestone 7af figure. Left: each design's median rise time to 90% of a 1 m step against its median overshoot (full simulator,
36 ms law, 64 episodes, flown with conditional integration at b = 0.25 m): 7ac's base designs, 7ae's band-trained designs and
7af's band-and-step-trained designs. Right: the same rise time against decoded outer-loop kd, with the cruise speed A_P / kd
under the proportional cap (A_P = 3.5 m/s^2) on the top axis. Writes m7af_step_obj.png."""
import json, os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
SFX = "_smoke" if os.environ.get("SMOKE") == "1" else ""
R = json.load(open(os.path.join(HERE, f"results{SFX}.json")))
AE = json.load(open(os.path.join(HERE, "..", "m7ae_cint_train", "results.json")))
AD = json.load(open(os.path.join(HERE, "..", "m7ad_settle", "results.json")))
MID = "mid 36 ms D^0"
NEW, CINT, BASE = "aware lag39c125 cint25 step", "aware lag39c125 cint25", "aware lag39c125"


def med(v):
    return float(np.nanmedian(np.array([np.nan if x is None else x for x in v], float)))


def step(rs, s, b):
    return {(r["geom"], r["seed"]): r for r in rs if r["set"] == s and r["band"] == b and r["test"] == "step" and r["law_name"] == MID}


def calls(c):
    return {(x["geom"], x["seed"]): x for x in c}


sets = ((step(AD["resp"], BASE, 0.25), calls(AE["calls"]["base"]), "7ac: always-on integrator in training", "#e08e0b", "^"),
        (step(AE["resp"], CINT, 0.25), calls(AE["calls"]["new"]), "7ae: band in training", "#1f6fb2", "s"),
        (step(R["resp"], NEW, 0.25), calls(R["calls"]["new"]), "7af: band and a 1 m step in training", "#2e8b57", "o"))
fig, ax = plt.subplots(1, 2, figsize=(10, 4))
for st, cl, lab, c, m in sets:
    ks = sorted(st)
    ax[0].scatter([100 * med(st[k]["over"]) for k in ks], [med(st[k]["rise"]) for k in ks], s=20, c=c, marker=m, label=lab, alpha=0.85)
    ax[1].scatter([cl[k]["kd"] for k in ks], [med(st[k]["rise"]) for k in ks], s=20, c=c, marker=m, label=lab, alpha=0.85)
ax[0].set_xlabel("overshoot on a 1 m step (cm, median over 64 flights)")
ax[0].set_ylabel("rise time to 90% (s)")
ax[0].legend(fontsize=7, frameon=False)
ax[1].set_xlabel("outer-loop kd (1/s)")
ax[1].set_ylabel("rise time to 90% (s)")
top = ax[1].secondary_xaxis("top", functions=(lambda kd: 3.5 / np.maximum(kd, 1e-3), lambda v: 3.5 / np.maximum(v, 1e-3)))
top.set_xlabel("cruise speed under the cap, A_P / kd (m/s)", fontsize=8)
for a in ax:
    a.spines[["top", "right"]].set_visible(False)
ax[0].set_title("all flown with conditional integration, b = 0.25 m", fontsize=8)
fig.tight_layout()
fig.savefig(os.path.join(HERE, f"m7af_step_obj{SFX}.png"), dpi=130)
print("wrote", f"m7af_step_obj{SFX}.png")
