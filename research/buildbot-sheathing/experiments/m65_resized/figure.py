"""Figure for milestone 65: python experiments/m65_resized/figure.py (reads results.json and m64's).

Left: coverage of balance-envelope cases against the bound the planner is sized to (true bias = that bound, worst
direction). Right: worst four-row residual of planned presses, re-sized (this milestone) against milestone 64's
planner kept at 0.2 N under the same true bias (seed 64, a different held-out set)."""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, "results.json")))
D64 = json.load(open(os.path.join(HERE, "..", "m64_overbias", "results.json")))
SPEC, BP = D["spec_mm"], D["bplans"]

fig, (a1, a2) = plt.subplots(1, 2, figsize=(10.5, 4.4))
for n, col in (("g1", "C0"), ("h1", "C3")):
    S = [D["S"][f"{n} {b:g}"] for b in BP]
    a1.plot(BP, [s["cov"] for s in S], "o-", color=col, label=f"{n.upper()} planner sized to the bias")
    a2.plot(BP, [s["wmax"] for s in S], "o-", color=col, label=f"{n.upper()} sized to the bias (seed 65)")
    xb = [b * D64["B"] for b in D64["betas"]]
    a2.plot(xb, [D64["S"][f"{n} {b:g}"]["wmax"] for b in D64["betas"]], "s--", mfc="none", color=col,
            alpha=0.7, label=f"{n.upper()} kept at 0.2 N (milestone 64, seed 64)")
a2.axhline(SPEC, color="k", lw=0.7, ls="--", label=f"{SPEC:g} mm spec")
a2.set_yscale("log")
for a in (a1, a2):
    a.set_xlabel("sensor bias bound B = true bias, worst direction (N)")
a1.set_ylabel("coverage of balance-envelope cases (%)")
a2.set_ylabel("worst four-row residual of planned presses (mm)")
a1.set_title("What sizing the planner to the bias costs", fontsize=10)
a2.set_title("Re-sizing against keeping the 0.2 N planner", fontsize=10)
a1.legend(fontsize=7)
a2.legend(fontsize=7)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=110)
print("wrote figure.png")
nf = sum(o["flips"] == 0 for o in D["OV"])
print(f"over-spec planned presses with no flip: {nf} of {len(D['OV'])}")
for n in ("g1", "h1"):
    print(f"  {n} worst/B (mm per N): " + "; ".join(f"{b:g} -> {D['S'][f'{n} {b:g}']['wmax'] / b:.4f}" for b in BP))
