"""Figure for milestone 9 (straightening the joint stud) from results.json:
python experiments/m9_straighten/figure.py"""
import json
import os
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from buildbot_sheathing import straighten as S  # noqa: E402

r = json.load(open(os.path.join(HERE, "results.json")))
fig, ax = plt.subplots(1, 3, figsize=(14, 4.2))

# A. shape left by each push, per unit bow
u = np.linspace(0, 1, 401)
ax[0].plot(u, 4 * u * (1 - u), color="0.5", lw=1.5, label="bowed stud (no push)")
for ends, ls in (("pinned", "-"), ("fixed", "--")):
    ax[0].plot(u, S.residual(u, ends), "C0", ls=ls, label=f"after mid push, {ends} ends")
    _, fin, x = S.simultaneous([1 / 6, 0.5, 5 / 6], ends)
    ax[0].plot(x, fin, "C2", ls=ls, label=f"after three-point push, {ends}")
ax[0].set_xlabel("height along the stud (fraction)")
ax[0].set_ylabel("offset from the line / bow")
ax[0].set_title("A. What a push leaves")
ax[0].legend(fontsize=7)

# B. force percentiles against what the humanoids can push sideways
rows = [b for b in r["B"] if b["ends"] == "pinned"]
labels = [f"{b['warp']}\n{b['policy']}" for b in rows]
xs = np.arange(len(rows))
ax[1].bar(xs - 0.2, [b["median"] for b in rows], 0.4, color="C0", label="median stud")
ax[1].bar(xs + 0.2, [b["p99"] for b in rows], 0.4, color="C1", label="99th percentile")
caps = {}
for c in r["C"]:
    caps.setdefault(c["robot"], []).append(min(v for v in c["caps"][2:] if v is not None))
for (name, v), col in zip(caps.items(), ("C3", "C4")):
    ax[1].axhline(min(v), color=col, ls="--", lw=1, label=f"{name.upper()} sideways push at 1.2-1.3 m")
ax[1].set_yscale("log")
ax[1].set_xticks(xs)
ax[1].set_xticklabels(labels, fontsize=8)
ax[1].set_ylabel("push force (N), pinned ends")
ax[1].set_title("B. Force to straighten (Stud-grade 2x4)")
ax[1].legend(fontsize=7)

# C. clean sheets
D = r["D"]
pipes = ["2x, three, no push", "2x, three, mid pinned", "2x, three, nails pinned", "2x2x, single"]
names = ["single 2x\nno push", "single 2x\nmid push", "single 2x\nnail by nail", "doubled\njoint"]
width = 0.2
for i, (rock, w) in enumerate((("three-foot", "low"), ("three-foot", "high"), ("smooth (Drake)", "low"),
                              ("smooth (Drake)", "high"))):
    vals = [next(d["clean"] for d in D if d["rock"] == rock and d["warp"] == w and d["pipeline"] == p) for p in pipes]
    ax[2].bar(np.arange(4) + (i - 1.5) * width, vals, width, label=f"{w} warp, {rock} rock")
for rock, ls in (("three-foot", ":"), ("smooth (Drake)", "-.")):
    ceil = next(d["clean"] for d in D if d["rock"] == rock and d["warp"] == "straight")
    ax[2].axhline(ceil, color="k", ls=ls, lw=1, label=f"straight studs, {rock} rock")
ax[2].axhline(0.95, color="C3", lw=1)
ax[2].set_xticks(np.arange(4))
ax[2].set_xticklabels(names, fontsize=8)
ax[2].set_ylabel("first-pass clean sheets")
ax[2].set_title("C. Straightening removes the bow, not the pose")
ax[2].set_ylim(0, 1.32)
ax[2].legend(fontsize=6, loc="upper center", ncol=2)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=130)
print("wrote figure.png")
