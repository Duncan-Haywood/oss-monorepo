"""Figure for milestone 66: python experiments/m66_directterm/figure.py (reads results.json).

Left: coverage of balance-envelope cases against the bias bound, milestone 65's chain alone and with the direct-term
gate (Y_k + D_k <= spec). Right: worst four-row residual of the presses each one plans, against the 0.03 mm spec."""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, "results.json")))
SPEC, BP = D["spec_mm"], D["bplans"]

fig, (a1, a2) = plt.subplots(1, 2, figsize=(10.5, 4.4))
for n, col in (("g1", "C0"), ("h1", "C3")):
    S = [D["S"][f"{n} {b:g}"] for b in BP]
    a1.plot(BP, [s["ccov"] for s in S], "s--", mfc="none", color=col, alpha=0.7, label=f"{n.upper()} chain alone")
    a1.plot(BP, [s["gcov"] for s in S], "o-", color=col, label=f"{n.upper()} with the direct-term gate")
    a2.plot(BP, [s["cworst"] for s in S], "s--", mfc="none", color=col, alpha=0.7, label=f"{n.upper()} chain alone")
    a2.plot(BP, [s["gworst"] for s in S], "o-", color=col, label=f"{n.upper()} gate passed")
a2.axhline(SPEC, color="k", lw=0.7, ls="--", label=f"{SPEC:g} mm spec")
for a in (a1, a2):
    a.set_xlabel("sensor bias bound B = true bias, worst direction (N)")
    a.grid(alpha=0.3)
a1.set_ylabel("coverage of balance-envelope cases (%)")
a2.set_ylabel("worst four-row residual of planned presses (mm)")
a1.legend(fontsize=8)
a2.legend(fontsize=8)
fig.suptitle(f"Milestone 66: pricing the bias's direct term (held-out section M, seed {D['seed']})", fontsize=10)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=130)
print("wrote figure.png")
