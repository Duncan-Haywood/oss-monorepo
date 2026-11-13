"""Figure for milestone 7d: share of the 384 held-out episodes (6 designs x 64) that diverge, against the tilt-command clip, for each
design set, at 6 s and 18 s. Numbers parsed from diag.txt (post hoc); the 20 deg points equal results.txt's base arm."""
import os, re
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
data, cur = {}, None
for line in open(os.path.join(HERE, "diag.txt")):
    m = re.match(r"\[(.+)\]", line)
    if m:
        cur = m.group(1); continue
    m = re.match(r"\s+clip\s+(\d+) deg,\s+(\d+) s: dead .* \(total (\d+)\)", line)
    if m and cur:
        data.setdefault((cur, int(m.group(2))), []).append((int(m.group(1)), int(m.group(3)) / 384))
STY = {"bolted": ("o", "#d62728", "bolted onto 6b (2.3-3.4x ceiling)"), "1.25x": ("^", "#ff7f0e", "6b at 1.25x ceiling"),
       "retrained": ("s", "#1f77b4", "retrained (0.88-1.11x)"), "0.8x": ("v", "#2ca02c", "6b at 0.8x ceiling")}
fig, ax = plt.subplots(1, 2, figsize=(10, 4), sharey=True)
for k, hz in enumerate((6, 18)):
    for s, (mk, col, name) in STY.items():
        xs, ys = zip(*sorted(data[(s, hz)]))
        ax[k].plot(xs, ys, marker=mk, color=col, label=name)
    ax[k].axvline(20, color="#888", ls=":", lw=1)
    ax[k].set_title(f"{hz} s held-out episodes, lever 0")
    ax[k].set_xlabel("tilt-command clip (deg); 20 = the simulator's default")
    ax[k].grid(alpha=0.3)
ax[0].set_ylabel("share of 384 episodes diverged")
ax[0].legend(fontsize=8, loc="center right")
fig.suptitle("The 20 deg tilt-command clip, not the integrator clip, keeps the unstable integrator feed-forward bounded (simulated)", fontsize=10)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "m7d_clip.png"), dpi=130)
print("ok")
