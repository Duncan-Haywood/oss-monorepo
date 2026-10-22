"""Area against ABC delay for the four 4-bit designs at each target period. Reads swept.json; writes tradeoff.png.
Run: python figure.py (matplotlib)"""
import json
from pathlib import Path
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

D = Path(__file__).resolve().parent
J = json.load(open(D / "swept.json"))
fig, ax = plt.subplots(figsize=(6.4, 4.2))
for p, c in zip((1, 2, 4, 8), ("#1b6ca8", "#2a9d8f", "#e9a100", "#c0392b")):
    pts = sorted([(r["delay_ps"] / 1000, r["area_um2"] / 1000) for r in J["rows"] if r["p"] == p and r["wb"] == 4])
    ax.plot(*zip(*pts), "o-", color=c, label=f"p = {p} lanes")
for t in (3, 4, 5, 6, 8, 10):
    ax.axvline(t, color="#999", lw=0.5, ls=":")
ax.set_xlabel("ABC critical-path delay (ns); dotted lines are the targets T")
ax.set_ylabel("SKY130 HD area (1000 um$^2$)")
ax.set_title("4-bit MAC engines: area vs delay over target period")
ax.legend(); fig.tight_layout(); fig.savefig(D / "tradeoff.png", dpi=130)
