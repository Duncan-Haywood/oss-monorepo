"""Milestone 7al figure: deaths of 640 against start-offset half-width, with 7l's cap at 0.5 and 1 m. Writes m7al_roa.png."""
import json, os
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
J = json.load(open(os.path.join(HERE, "stats.json")))
hw = [0.5 * float(s) for s in J["table"]]
fig, ax = plt.subplots(figsize=(6.4, 3.8))
for k, (lab, c, ls) in enumerate([("retrained, quiet+O", "C0", "--"), ("1.25x, quiet+O", "C1", "--"),
                                  ("retrained, full", "C0", "-"), ("1.25x, full", "C1", "-")]):
    ax.plot(hw, [v[k] for v in J["table"].values()], ls, color=c, marker="o", ms=3, label=lab)
    ax.plot([0.5 * float(s) for s in J["cap"]], [v[k] for v in J["cap"].values()], "x" if ls == "-" else "+", color=c, ms=9,
            label=f"{lab}, 7l cap")
ax.axvline(0.5, color="0.6", lw=0.8); ax.text(0.51, 300, "episode's 0.5 m", fontsize=7, color="0.4")
ax.set_xlabel("start-offset half-width per axis (m)"); ax.set_ylabel("deaths of 640 (18 s)")
ax.set_title("45° tilt limit: basin of the retrained designs, and the cap", fontsize=9)
ax.legend(fontsize=6, ncol=2); fig.tight_layout(); fig.savefig(os.path.join(HERE, "m7al_roa.png"), dpi=130)
