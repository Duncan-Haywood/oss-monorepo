"""Figure for milestone 52: python experiments/m52_slackcal/figure.py (reads results.json)."""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, "results.json")))
S = D["summary"]
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(11, 4.2))
Hs = [0.0, 5.0, 20.0]
w = 0.2
for j, (n, cal, col) in enumerate([("g1", "in51_pl", "0.6"), ("g1", "in51_ps", "C0"),
                                   ("h1", "in51_pl", "0.8"), ("h1", "in51_ps", "C1")]):
    ys = [100 * S[f"{n} {H:g}"][cal] / S[f"{n} {H:g}"]["in51"] for H in Hs]
    lab = f"{n.upper()}, calibration {'under the hose load (m51)' if cal == 'in51_pl' else 'with the hose slack'}"
    ax1.bar([k + (j - 1.5) * w for k in range(3)], ys, w, color=col, label=lab)
ax1.set_ylim(85, 100.5)
ax1.set_xticks(range(3), [f"{H:g} N" for H in Hs])
ax1.set_xlabel("hose drag swept")
ax1.set_ylabel("pose-cases inside the drag envelope with a plan (%)")
ax1.set_title("A slack-hose calibration recovers the G1's coverage", fontsize=10)
ax1.legend(fontsize=7, loc="lower left")
cls = {}
for n, H, p, phi, ax, cal_ok, pose_ok, exact_ok, in51, inp in D["drops"]:
    if not in51:
        continue
    c = "sensor error" if exact_ok else "plan limit at the pose"
    cls[(n, c)] = cls.get((n, c), 0) + 1
R51 = json.load(open(os.path.join(HERE, "..", "m51_envelope", "results.json")))["drops_inside"]
m51 = {n: (sum(1 for d in R51 if d[0] == n and not d[5]), sum(1 for d in R51 if d[0] == n and d[5])) for n in ("g1", "h1")}
for j, n in enumerate(["g1", "h1"]):
    ax2.bar(j - 0.18, m51[n][0], 0.32, color="C3", label="calibration fails (m51)" if j == 0 else None)
    ax2.bar(j - 0.18, m51[n][1], 0.32, bottom=m51[n][0], color="0.6", label="own pose fails (m51)" if j == 0 else None)
    b = 0
    for c, col in (("plan limit at the pose", "C0"), ("sensor error", "C2")):
        v = cls.get((n, c), 0)
        ax2.bar(j + 0.18, v, 0.32, bottom=b, color=col, label=f"{c} (slack calibration)" if j == 0 else None)
        b += v
ax2.set_xticks(range(2), ["G1", "H1"])
ax2.set_ylabel("dropped pose-cases inside milestone 51's envelope")
ax2.set_title("What is left: plan limits at the 1.0 to 1.6 m grips", fontsize=10)
ax2.legend(fontsize=7)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=110)
print("wrote figure.png")
