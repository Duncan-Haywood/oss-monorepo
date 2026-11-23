"""Figure for milestone 12g (section VI-b at ten seeds): held-out flights that diverged against the tilt-command limit, lever 0,
6 s and 18 s episodes, for the four `above` integrator feed-forward sets (bolted-on, ki at 1.25x and 0.8x the linear ceiling,
retrained), ten seeds each (of 640). The dotted line is the number of flights the linear model calls unstable for the 1.25x set.
Whiskers on the 1.25x and retrained points at 45 deg are the bootstrap 95% intervals over designs from stats.json."""
import json, os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
S = json.load(open(os.path.join(HERE, "stats.json")))
CAPS = (20, 30, 45, 59)
SETS = (("bolted", "#d62728", "bolted-on (2.3-3.4x past ceiling)"), ("1.25x", "#ff7f0e", "ki 1.25x ceiling"),
        ("retrained", "#1f77b4", "retrained (on the ceiling)"), ("0.8x", "#2ca02c", "ki 0.8x ceiling"))
fig, ax = plt.subplots(1, 2, figsize=(11, 4.2), sharey=True)
for a, hz in zip(ax, (6, 18)):
    for key, col, name in SETS:
        v = [S["tilt"][f"{key}|{c:g}|{hz}"]["total"] for c in CAPS]
        a.plot(CAPS, v, "o-", color=col, label=name)
        r = S["tilt"].get(f"{key}|45|{hz}", {})
        if "ci_share_of_all" in r:
            lo, hi = (640 * x for x in r["ci_share_of_all"])
            a.errorbar([45], [r["total"]], yerr=[[r["total"] - lo], [hi - r["total"]]], color=col, capsize=3, lw=1)
    a.axhline(S["m7d"]["1.25x|linear"]["unstable"], ls=":", color="#ff7f0e", lw=1, label="1.25x: flights the linear model calls unstable")
    a.set_xticks(CAPS); a.set_xlabel("tilt-command limit (deg)"); a.set_title(f"{hz} s flights, lever 0")
ax[0].set_ylabel("held-out flights diverged (of 640, ten seeds)")
ax[1].legend(fontsize=8, loc="center right")
fig.tight_layout()
fig.savefig(os.path.join(HERE, "m12g_tilt.png"), dpi=130)
print("wrote m12g_tilt.png")
