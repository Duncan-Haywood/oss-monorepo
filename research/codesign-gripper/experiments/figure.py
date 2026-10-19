"""Best objective vs evaluations from results.json -> curves.png, and the winning finger STLs -> ../stl/."""
import json, os, sys
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from codesign_gripper import stl

R = json.load(open(os.path.join(HERE, "results.json")))


def running_best(recs):
    out, b = [], -9
    for r in recs:
        b = max(b, r["J"]); out.append(b)
    return out


fig, ax = plt.subplots(figsize=(6.4, 3.8))
for name, col in (("random search", "#888888"), ("CMA-ES", "#d95f02"), ("Bayesian opt (GP-EI)", "#1b9e77")):
    runs = np.array([running_best(r) for r in R["baseline_evals"][name]])
    n = np.arange(1, runs.shape[1] + 1)
    ax.plot(n, np.median(runs, 0), color=col, label=f"{name} (median of {len(runs)})")
    ax.fill_between(n, runs.min(0), runs.max(0), color=col, alpha=0.15)
ag = running_best(R["agent"])
ax.step(np.arange(1, len(ag) + 1), ag, where="post", color="#7570b3", lw=2, label="session agent (1 run)")
ax.set_xlabel("simulator evaluations (designs scored)")
ax.set_ylabel("best objective J so far")
ax.set_ylim(0.3, 1.0)
ax.grid(alpha=0.3)
ax.legend(fontsize=8, loc="lower right")
ax.set_title("Gripper co-design: best J vs evaluations (higher is better)", fontsize=10)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "curves.png"), dpi=130)

os.makedirs(os.path.join(HERE, "..", "stl"), exist_ok=True)
x = R["best"]["x"]
stl.write_stl(x, os.path.join(HERE, "..", "stl", "finger_winner.stl"), "finger_winner")
print("wrote curves.png and stl/finger_winner.stl for", [round(v, 2) for v in x])
