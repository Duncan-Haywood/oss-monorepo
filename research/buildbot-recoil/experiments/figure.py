"""Peak sideways error and the held-contact limit against recoil impulse (reads results.json)."""
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = Path(__file__).resolve().parent
rows = [r for r in json.loads((HERE / "results.json").read_text()) if r["group"] == "A" and r["stable"]]
fig, ax = plt.subplots(1, 2, figsize=(9, 3.6), sharey=True)
for a, dl in zip(ax, (0.0, 0.01)):
    for f in (2, 4, 8, 12):
        g = [r for r in rows if r["f"] == f and r["delay"] == dl]
        if g:
            a.plot([r["J"] for r in g], [r["peak_yz_mm"] for r in g], "o-", label=f"{f} Hz")
    a.axhline(3.9, color="k", ls="--", lw=1)
    a.set_xscale("log"); a.set_yscale("log")
    a.set_xlabel("recoil impulse (N s)"); a.set_title(f"loop delay {int(dl*1e3)} ms")
ax[0].set_ylabel("peak tip error in the wall plane (mm)")
ax[0].text(0.26, 4.3, "joint-nail window +-3.9 mm", fontsize=8)
ax[1].legend(title="loop bandwidth", fontsize=8)
fig.tight_layout()
fig.savefig(HERE / "figure.png", dpi=130)
