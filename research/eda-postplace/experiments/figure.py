"""ABC combinational delay against the placed implied period, per design, at both targets. Reads placed.json; writes placed.png.
Run: python figure.py (matplotlib)"""
import json
from pathlib import Path
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

D = Path(__file__).resolve().parent
J = json.load(open(D / "placed.json"))
fig, axs = plt.subplots(1, 2, figsize=(9, 4), sharey=True)
for ax, T, c in zip(axs, J["targets"], ("#1b6ca8", "#c0392b")):
    rows = [r for r in J["rows"] if r["period"] == T]
    x = [r["abc_delay_ps"] / 1000 for r in rows]
    ax.scatter(x, [r["netlist_period_ns"] for r in rows], s=14, color="#999", label="STA, no wires")
    ax.scatter(x, [r["placed_period_ns"] for r in rows], s=14, color=c, label="after placement")
    ax.plot([2, 12], [2, 12], ":", color="#555", lw=0.8)
    ax.axhline(T / 1000, color="#333", lw=0.6, ls="--")
    ax.set_title(f"ABC target {T / 1000:g} ns (dashed)")
    ax.set_xlabel("ABC combinational delay (ns)")
    ax.legend(fontsize=8)
axs[0].set_ylabel("implied clock period, T $-$ worst slack (ns)")
fig.tight_layout(); fig.savefig(D / "placed.png", dpi=130)
