"""Held-out position RMS and yaw RMS of the co-designed quadrotor with and without the lateral force of canted rotors. Reads results.json; writes poshold.png."""
import json, os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
fig, (a, b) = plt.subplots(1, 2, figsize=(10, 3.8))
rows = [("no cant", 0, True, True), ("35 deg\nforce modelled", 35, True, True), ("35 deg\ndesigned ignoring it", 35, False, True), ("80 deg\nforce modelled", 80, True, True), ("80 deg\ndesigned ignoring it", 80, False, True)]
runs = R["runs"]
for i, (lab, cap, tr, ev) in enumerate(rows):
    rs = [r for r in runs if r["cap"] == cap and r["couple"] == tr]
    a.scatter([i] * len(rs), [r["on"]["pos"] for r in rs], s=16, color="#2f6fb0")
    a.plot([i - .25, i + .25], [np.mean([r["on"]["pos"] for r in rs])] * 2, "k-", lw=1.5)
    b.scatter([i] * len(rs), [r["on"]["yaw"] for r in rs], s=16, color="#c0504d")
    b.plot([i - .25, i + .25], [np.mean([r["on"]["yaw"] for r in rs])] * 2, "k-", lw=1.5)
for ax, t, y in ((a, "held-out position RMS (m), physical model", "pos"), (b, "held-out yaw RMS (deg), physical model", "yaw")):
    ax.set_xticks(range(len(rows))); ax.set_xticklabels([r[0] for r in rows], fontsize=7); ax.set_ylabel(t, fontsize=8)
a.set_yscale("log"); a.set_title("Position hold: ignoring the lateral force is costly", fontsize=9); b.set_title("Yaw: cant helps either way", fontsize=9)
fig.tight_layout(); fig.savefig(os.path.join(HERE, "poshold.png"), dpi=130)
