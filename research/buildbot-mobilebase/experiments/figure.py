"""Sheet time against lift speed for a G1 on a drive-and-lift base, with the hand, gantry and walking-G1 times."""
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = Path(__file__).resolve().parent
R = json.loads((HERE / "results.json").read_text())
fig, ax = plt.subplots(1, 2, figsize=(10, 4.4), sharey=True)
for a, v in zip(ax, (0.5, 4.0)):
    for row, c in zip([w for w in R["whole"] if w["v"] == v], ("C0", "C1", "C2")):
        ls = sorted(float(k) for k in row["by_v_lift"])
        a.plot(ls, [row["by_v_lift"][str(k)] for k in ls], "o-", color=c, label=f"drive {row['v_drive']:g} m/s")
    a.axhline(61, color="C3", ls="--", lw=1, label="gantry, 61 s (buildbot-custom)")
    nail = [w for w in R["whole"] if w["v"] == v][0]["nailing"]
    a.axhline(nail + 12 * 5.0, color="0.4", ls=":", lw=1, label="walking G1, 5 s per re-stance")
    a.set_xscale("log")
    a.set_xlabel("lift speed (m/s)")
    a.set_title(f"tip {v:g} m/s: 62 nails in 13 stances, 2 s settle", fontsize=9)
    a.legend(fontsize=8)
ax[0].set_ylabel("seconds per 4x8 sheet")
ax[0].set_ylim(0, 130)
fig.tight_layout()
fig.savefig(HERE / "figure.png", dpi=130)
