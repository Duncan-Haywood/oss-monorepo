"""Figure for milestone 11: python experiments/m11_measured/figure.py (reads profiles.json, results.json)."""
import json
import math
import os
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from buildbot_sheathing import measured as M  # noqa: E402

D = json.load(open(os.path.join(HERE, "profiles.json")))
R = json.load(open(os.path.join(HERE, "results.json")))
vert = [m for m in D["members"] if m["kind"] == "vertical"]


def smooth(x, k=11):
    x = np.asarray(x, float)
    return np.convolve(np.r_[np.full(k // 2, x[0]), x, np.full(k // 2, x[-1])], np.ones(k) / k, "valid")


fig, ax = plt.subplots(1, 3, figsize=(15, 5.6))
for i, m in enumerate(vert):
    v = np.array(m["v"])
    s = (v - v[0]) / (v[-1] - v[0])
    f = M.chord_fit(s, m["centre"])
    off = 8 * i
    ax[0].plot(f["dev"] + off, v - v[0], color="0.75", lw=0.8)
    ax[0].plot(M.chord_fit(s, smooth(m["centre"]))["dev"] + off, v - v[0], color=f"C{i}", lw=1.6)
    par = 4 * f["bow"] * s * (1 - s)
    par -= np.polyval(np.polyfit(s, par, 1), s)
    ax[0].plot(par + off, v - v[0], "k--", lw=1)
ax[0].set_xlabel("face centreline about its chord (mm; studs offset by 8 mm)")
ax[0].set_ylabel("height above the bottom plate (mm)")
ax[0].set_title("Six installed studs: slices (grey), 110 mm mean,\nfitted parabola (dashed)", fontsize=10)

rows = R["C"]["rows"]
ax[1].bar(range(len(rows)), [abs(r["bow_8ft_in"]) for r in rows], color=[f"C{i}" for i in range(len(rows))])
for y, lab in ((0.11, "low published mean"), (0.21, "high published mean")):
    ax[1].axhline(y, color="k", ls=":", lw=1)
    ax[1].text(5.4, y + 0.005, lab, ha="right", fontsize=8)
ax[1].set_xticks(range(len(rows)), [f"{r['u']:.0f}" for r in rows], fontsize=8)
ax[1].set_xlabel("stud position along the wall (mm)")
ax[1].set_ylabel("|flatwise bow| scaled to 8 ft (in)")
ax[1].set_title("Bow amplitude sits on the published means", fontsize=10)

E = R["E"]["rows"]
names = [("parabola at each stud's own bow", "parabolas\n(own bows)"),
         ("measured, common part removed", "measured,\nno common"),
         ("measured (110 mm mean)", "measured\n110 mm"),
         ("measured (raw slices)", "measured\nraw")]
x = np.arange(len(names) + 1)
vals = [E["2x|three|model low"]["clean"]] + [E[f"2x|three|{k}"]["clean"] for k, _ in names]
ax[2].bar(x, vals, color=["0.6"] + ["C0"] * len(names))
ax[2].set_xticks(x, ["model,\nlow warp"] + [lab for _, lab in names], fontsize=8)
for xi, val in zip(x, vals):
    ax[2].text(xi, val + 0.01, f"{val:.2f}", ha="center", fontsize=8)
ax[2].axhline(E["2x2x|three|measured (110 mm mean)"]["clean"], color="C2", lw=1.5)
ax[2].text(4.4, 0.965, "doubled joints, measured: 1.00", ha="right", fontsize=8, color="C2")
ax[2].set_ylim(0, 1.05)
ax[2].set_ylabel("first-pass clean sheets (single 2x, three reads)")
ax[2].set_title("The parabola flatters single 2x by 11-15 points", fontsize=10)
fig.suptitle("Milestone 11: measured studs from a scanned robot-built 2x4 wall (Adel et al. 2024 data, CC BY 4.0)", fontsize=11)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=110)
