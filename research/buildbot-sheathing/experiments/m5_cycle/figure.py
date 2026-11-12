"""Figure for milestone 5 from results.json:  python experiments/m5_cycle/figure.py"""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
r = json.load(open(os.path.join(HERE, "results.json")))
fig, ax = plt.subplots(1, 3, figsize=(14, 4))
POL = ["single", "three", "dense"]
FR = {"2x": ("single 2x joint", "C3"), "2x2x": ("two 2x at the joint", "C2")}
BASE = "ledger, s_x 1 mm"

# A. first-pass clean sheets by sensing, framing and recoil (ledger, lower warp)
w = 0.2
for i, (fr, rc) in enumerate([(f, c) for f in FR for c in ("none", "nowait")]):
    vals = [next(x for x in r["A"] if x["framing"] == fr and x["placement"] == BASE and x["warp"] == "low"
                 and x["recoil"] == rc and x["policy"] == p)["clean"] for p in POL]
    ax[0].bar(np.arange(3) + (i - 1.5) * w, vals, w, color=FR[fr][1], alpha=1.0 if rc == "none" else 0.45,
              label=f"{FR[fr][0]}, " + ("recoil waited out" if rc == "none" else "fire at once, 4 N s"))
ax[0].axhline(0.95, color="k", lw=0.8, ls="--")
ax[0].set_xticks(range(3))
ax[0].set_xticklabels([f"{p} read" + ("s" if p != "single" else "") for p in POL])
ax[0].set(ylabel="first-pass clean sheets", ylim=(0, 1.55), yticks=np.arange(0, 1.01, 0.2),
          title="A. Clean sheets on a ledger (lower stud warp)")
ax[0].legend(fontsize=7, loc="upper left")

# B. seconds a sheet by stage at the middle settings (from the printed example cell)
cell = {"t_nail": 54.0, "t_place": 30.0, "t_ledger": 10.0, "t_read": 1.0, "t_fix": 30.0}
row = next(b for b in r["B"] if all(b[k] == v for k, v in cell.items()))
labels, stacks = [], []
missed = {(x["framing"], x["policy"]): x["missed"] for x in r["A"]
          if x["placement"] == BASE and x["warp"] == "low" and x["recoil"] == "none"}
for fr in FR:
    for p in POL:
        reads = 3 * {"single": 1, "three": 3, "dense": 17}[p] + 2
        st = [cell["t_place"] + cell["t_ledger"], reads * cell["t_read"], cell["t_nail"] + 2.4,
              missed[(fr, p)] * cell["t_fix"]]
        assert abs(sum(st) - row[fr][p]) < 1e-6
        labels.append(f"{'2x' if fr == '2x' else '2×2x'}\n{p}")
        stacks.append(st)
stacks = np.array(stacks)
bottom = np.zeros(len(stacks))
for j, (name, col) in enumerate(zip(["place + ledger", "sense", "nail (moves, settles)", "rework"],
                                    ["C0", "C1", "C7", "C3"])):
    ax[1].bar(range(len(stacks)), stacks[:, j], bottom=bottom, color=col, label=name)
    bottom += stacks[:, j]
for k, t in enumerate(bottom):
    ax[1].annotate(f"{t:.0f}", (k, t), ha="center", fontsize=7, textcoords="offset points", xytext=(0, 2))
ax[1].set_xticks(range(len(stacks)))
ax[1].set_xticklabels(labels, fontsize=7)
ax[1].set(ylabel="seconds a sheet", title="B. Seconds a sheet (nail 54, place 30, ledger 10,\nread 1, fix 30 s)")
ax[1].set_ylim(0, bottom.max() * 1.45)
ax[1].legend(fontsize=7, loc="upper left", ncol=2)

# C. break-even framing time for the extra joint stud against rework time (the place, ledger and
# nailing seconds are common to both framings and cancel; the spread is the read time)
for trd, mk in ((1.0, "o-"), (3.0, "s--")):
    pts = sorted({b["cell"][4]: b["break_even"] for b in r["C"] if b["cell"][3] == trd}.items())
    ax[2].plot([p[0] for p in pts], [p[1] for p in pts], mk, color="C0" if trd == 1 else "C1",
               label=f"{trd:.0f} s a read (any place, ledger or nailing time)")
ax[2].axhline(20, color="k", lw=0.8, ls=":")
ax[2].set(xlabel="rework, seconds a missed nail", ylabel="seconds the extra joint stud may take",
          title="C. Break-even framing time (lower warp)", ylim=(0, 75))
ax[2].legend(fontsize=7)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=130)
