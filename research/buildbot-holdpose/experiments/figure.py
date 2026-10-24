"""Peak joint fraction against load at the stud carry pose: default balanced pose against the searched posture. Reads results.json."""
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

here = Path(__file__).parent
res = json.loads((here / "results.json").read_text())
kg = [s["kg"] for s in res["sweep"]]
fig, ax = plt.subplots(figsize=(6.4, 4))
ax.plot(kg, [s["u_default"] for s in res["sweep"]], marker="o", label="default balanced pose")
ax.plot(kg, [s["u_search"] for s in res["sweep"]], marker="o", label="searched posture (best of 3 seeds)")
for rho in (0.5, 0.6):
    ax.axhline(rho, ls=":", color="grey")
    ax.text(kg[-1], rho + 0.01, f"continuous = {rho} of peak", ha="right", fontsize=8)
ax.set_xlabel("load held in both hands (kg), G1 at 0.3 m forward, 0.6 m high, CoP 0.06 m ahead of the sole point")
ax.set_ylabel("largest joint torque / peak")
ax.set_title("G1 stud-carry hold: searched posture vs default")
ax.legend(fontsize=8)
fig.tight_layout()
fig.savefig(here / "figure.png", dpi=130)
