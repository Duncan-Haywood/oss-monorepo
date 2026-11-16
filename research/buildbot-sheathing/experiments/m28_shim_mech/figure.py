"""Figure for milestone 28: python experiments/m28_shim_mech/figure.py (reads results.json)."""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))

fig, (a, b) = plt.subplots(1, 2, figsize=(11, 4.4))
for i, rho in enumerate(sorted({r["rho"] for r in R["C"]["rows"]})):
    rows = [r for r in R["C"]["rows"] if r["rho"] == rho]
    a.plot([r["mu"] for r in rows], [r["P_in"] for r in rows], "o-", color=f"C{i}",
           label=f"push to drive the wedge, press at {rho:.1f} W")
for j, r in enumerate(x for x in R["C"]["robots"] if x["z"] == 0.5):
    a.axhline(r["push"], color=f"C{3 + j}", ls="--", lw=1.2)
    a.text(0.205, r["push"] + 4, f"stock {r['robot'].upper()}, both hands at 0.5 m: {r['push']:.0f} N", fontsize=8)
a.set(xlabel="friction coefficient on every face", ylabel="push (N)", ylim=(0, 290),
      title="Driving a 1:32 composite shim under the corner")
for i, q in enumerate((0.5, 0.8, 0.9)):
    d = [c for c in R["D"] if c["robot"] == "g1" and c["mu_s"] == 0.4 and c["ratio"] == q]
    ok = [c for c in d if not c["overruns"]]
    b.plot([c["tau"] * 1e3 for c in ok], [c["rms"] * 1e3 for c in ok], "o-", color=f"C{i}",
           label=f"wedge, G1 hand, $\\mu_k/\\mu_s$ = {q}")
st = [x for x in R["B"] if x["name"].startswith("1/16")][0]
b.axhline(st["rms"] * 1e3, color="k", ls="--", lw=1)
b.text(2.1, st["rms"] * 1e3 * 0.82, f"1/16 in shim stack: {st['rms'] * 1e3:.3f} mm", fontsize=8)
b.axhline(0.5, color="k", ls=":", lw=1)
b.text(2.1, 0.53, "0.5 mm assumed by milestones 10-13", fontsize=8)
b.set(xscale="log", yscale="log", xlabel="reaction time: slip seen to hand released (ms)",
      ylabel="corner height left, rms (mm)", title="Height a shim leaves (taps longer than the stroke omitted)")
b.set_xticks([2, 5, 10, 20, 50])
b.set_xticks([], minor=True)
b.set_xticklabels(["2", "5", "10", "20", "50"])
for ax in (a, b):
    ax.grid(alpha=0.3, which="both")
    ax.legend(fontsize=8, loc="lower right" if ax is b else "upper left")
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=130)
