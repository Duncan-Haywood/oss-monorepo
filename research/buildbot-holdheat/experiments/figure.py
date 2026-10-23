"""Hold time against load at the stud carry pose, one line per continuous/peak ratio. Reads results.json."""
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

here = Path(__file__).parent
res = json.loads((here / "results.json").read_text())
fig, ax = plt.subplots(figsize=(6.4, 4))
for rho in res["rho"]:
    pts = [(s["kg"], s["hold"][str(rho)]) for s in res["sweep"] if s["hold"][str(rho)] is not None]
    ax.plot([p[0] for p in pts], [p[1] for p in pts], marker="o", label=f"continuous = {rho:g} of peak")
ax.set_xlabel("load held in both hands (kg), G1 at 0.3 m forward, 0.6 m high")
ax.set_ylabel("time to the winding limit (thermal time constants)")
ax.set_yscale("log")
ax.set_title("G1 waist pitch: time to overheat holding a load")
ax.legend(fontsize=8)
fig.tight_layout()
fig.savefig(here / "figure.png", dpi=130)
