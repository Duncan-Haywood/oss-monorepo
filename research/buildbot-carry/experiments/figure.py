"""Figure from results.json: longest level step against load, and robot vs labourer carry rate."""
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = Path(__file__).resolve().parent
R = json.loads((HERE / "results.json").read_text())

fig, ax = plt.subplots(1, 3, figsize=(13, 3.9))
for n, col in (("g1", "#1b7f79"), ("h1", "#c2571a")):
    env = R["envelope"][n]
    masses = sorted({float(k.split("|")[0]) for k in env})
    for s, ls in ((0.0, "-"), (0.1, "--")):
        pts = [(m, env[f"{m}|{s}"]["L"]) for m in masses if env[f"{m}|{s}"]["L"] is not None]
        ax[0].plot(*zip(*pts), ls, marker="o", color=col, label=f"{n.upper()}, rise {int(s * 1000)} mm")
ax[0].set_xlabel("load in both hands (kg)")
ax[0].set_ylabel("longest step before touchdown (m)")
ax[0].set_title("Step length against load (mu 0.6)")
ax[0].legend(fontsize=7)

dists = [5, 15, 30]
for n, col in (("g1", "#1b7f79"), ("h1", "#c2571a")):
    for T, ls in (("T=0.4", "-"), ("T=0.8", ":")):
        row = R["rates"][n][T]
        ax[1].plot(dists, [row[f"{d}|20"]["robot"] for d in dists], ls, marker="o", color=col, label=f"{n.upper()}, {T[2:]} s/step")
lab = R["rates"]["g1"]["T=0.4"]
for ln, ls in (("1", "#555"), ("4", "#aaa")):
    ax[1].plot(dists, [lab[f"{d}|20"]["labourer"][f"1.1|{ln}"] for d in dists], "-", color=ls, lw=2.5, label=f"labourer 1.1 m/s, {ln} stud(s)")
ax[1].set_xlabel("one-way distance (m)")
ax[1].set_ylabel("2x4s delivered per minute (20 s handling)")
ax[1].set_title("Carry rate")
ax[1].legend(fontsize=6)

for n, col in (("g1", "#1b7f79"), ("h1", "#c2571a")):
    lm = R["rates"][n]["lmax_by_pieces"]
    ks = [int(k) for k, v in lm.items() if v]
    ax[2].bar([k + (0.2 if n == "h1" else -0.2) for k in ks], [lm[str(k)] for k in ks], 0.4, color=col, label=n.upper())
ax[2].set_xlabel("8 ft 2x4s in hand (3.8 kg each)")
ax[2].set_ylabel("longest level step (m)")
ax[2].set_title("Studs per trip")
ax[2].legend(fontsize=7)
fig.tight_layout()
fig.savefig(HERE / "figure.png", dpi=130)
print("ok")
