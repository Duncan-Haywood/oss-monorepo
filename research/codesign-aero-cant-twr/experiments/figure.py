"""Held-out RMS attitude error for the four arms (cant bound x TWR fixed or free) at each measured c, with per-seed points. Reads results.json; writes twr.png."""
import json, os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
names = {(0, False): "no cant, TWR 2", (0, True): "no cant, TWR free", (35, False): "cant 35°, TWR 2", (35, True): "cant 35°, TWR free"}
cols = ["#c0504d", "#e0a090", "#2f6fb0", "#8fb4dc"]
fig, a = plt.subplots(figsize=(8, 3.8))
for i, (arm, lab) in enumerate(names.items()):
    xs, ys = [], []
    for j, c in enumerate(R["cs"]):
        t = [t for t in R["table"] if t["k"] == c and (t["cap"], t["free"]) == arm][0]
        a.scatter([j + (i - 1.5) * 0.18] * len(t["rms_seeds"]), t["rms_seeds"], color=cols[i], s=14, label=lab if j == 0 else None)
a.set_xticks(range(len(R["cs"]))); a.set_xticklabels([f"c = {c}" for c in R["cs"]])
a.set_ylabel("held-out RMS attitude error (deg)"); a.legend(fontsize=8); a.set_title("Joint co-design, 1920 evaluations, 5 seeds each", fontsize=9)
fig.tight_layout(); fig.savefig(os.path.join(HERE, "twr.png"), dpi=130)
