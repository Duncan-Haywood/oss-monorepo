"""Figure for milestone 3: held-out loss given up by a cheat-when-cheap worker versus tau (reads results.json)."""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
r = json.load(open(os.path.join(HERE, "results.json")))
std = r["honest"]["fp16"]["loss_std"]
fig, ax = plt.subplots(1, 2, figsize=(9, 3.4))
for strat, c in (("skip", "C3"), ("half_batch", "C0"), ("float16", "C2")):
    rows = r["cheat"]["reorder/" + strat]
    t = [x["tau"] for x in rows]
    ax[0].errorbar(t, [x["deg_mean"] for x in rows],
                   yerr=[[x["deg_mean"] - x["deg_lo"] for x in rows], [x["deg_hi"] - x["deg_mean"] for x in rows]],
                   label=strat, color=c, marker="o", ms=3, capsize=2)
    ax[1].plot(t, [x["cheated"] for x in rows], label=strat, color=c, marker="o", ms=3)
ax[0].axhline(std, color="k", ls="--", lw=1, label="seed std of honest loss")
ax[0].axvspan(r["honest"]["fp16"]["drift_q"]["0.99"], r["honest"]["fp16"]["drift_q"]["1.0"], color="grey", alpha=0.25, label="benign fp16 drift (p99 to max)")
ax[0].set_xscale("symlog", linthresh=1e-6); ax[0].set_yscale("symlog", linthresh=1e-4)
ax[0].set_xlabel("tolerance tau (L2 of one step)"); ax[0].set_ylabel("held-out loss given up"); ax[0].legend(fontsize=6)
ax[1].set_xscale("log"); ax[1].set_xlabel("tolerance tau"); ax[1].set_ylabel("fraction of steps cheated"); ax[1].legend(fontsize=7)
fig.suptitle("Digits MLP, 20 seeds: the passing shortcut is free until tau is about 10x the worst benign drift", fontsize=9)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "margin.png"), dpi=130)
