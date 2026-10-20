"""Left: synthesised area of the rewritten RTL over the original's, by lane count (B = 4). Right: gated WS (gate per set)
area over OS area, rewritten RTL, B = 4 and 8. From results.json only. Needs matplotlib."""
import json, os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
HERE = os.path.dirname(os.path.abspath(__file__))
rows = json.load(open(os.path.join(HERE, "results.json")))["rows"]
by = {(r["P"], r["B"], r["mode"]): r for r in rows}
fig, ax = plt.subplots(1, 2, figsize=(9, 3.4))
for mode, name, st in ((0, "OS", "d-"), (1, "WS ungated", "o-"), (2, "WS gate/accumulator", "s-"), (3, "WS gate/set", "^-")):
    pts = sorted((r["P"], r["area_um2"] / r["old_area_um2"]) for r in rows if r["mode"] == mode and r["B"] == 4 and r["old_area_um2"])
    ax[0].plot([p[0] for p in pts], [p[1] for p in pts], st, label=name)
ax[0].set_xscale("log", base=2); ax[0].set_xlabel("lanes P (layer 64x70, B = 4)"); ax[0].set_ylabel("area, rewritten / original RTL"); ax[0].grid(alpha=.3); ax[0].legend(fontsize=8)
for B, st in ((4, "o-"), (8, "s-")):
    pts = sorted((P, by[(P, B, 3)]["area_um2"] / by[(P, B, 0)]["area_um2"]) for P in {r["P"] for r in rows} if (P, B, 3) in by and (P, B, 0) in by)
    ax[1].plot([p[0] for p in pts], [p[1] for p in pts], st, label=f"B = {B}")
ax[1].set_xscale("log", base=2); ax[1].set_xlabel("lanes P (layer 64x70)"); ax[1].set_ylabel("gated WS (gate/set) area / OS area"); ax[1].grid(alpha=.3); ax[1].legend(fontsize=8)
fig.tight_layout(); fig.savefig(os.path.join(HERE, "gatedmux.png"), dpi=130)
