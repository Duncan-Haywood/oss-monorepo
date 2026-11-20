"""Figure for milestone 66: python experiments/m66_directterm/figure.py (reads results.json).

Left: coverage of balance-envelope cases against the bias bound, milestone 65's chain alone and with the direct-term
gate (Y_k + D_k <= spec). Right: the largest bias each planned press could be certified to under the gate,
B* = min_k (spec - Y_k) / (D_k / B) (post hoc, diag.py), planned at B_plan = 0.4 N."""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, "results.json")))
SPEC, BP = D["spec_mm"], D["bplans"]


def planned(r):
    if "out" not in r:
        return None
    if r["out"].get("y") is not None:
        return r["out"]
    e = r.get("esc", {})
    for k, m in (("u", "Mu"), ("s", "S")):
        if e.get(m) is not None and e.get(k):
            return e[k]
    return None


fig, (a1, a2) = plt.subplots(1, 2, figsize=(10.5, 4.4))
for n, col in (("g1", "C0"), ("h1", "C3")):
    S = [D["S"][f"{n} {b:g}"] for b in BP]
    a1.plot(BP, [s["ccov"] for s in S], "s--", mfc="none", color=col, label=f"{n.upper()} chain alone")
    a1.plot(BP, [s["gcov"] for s in S], "o-", color=col, label=f"{n.upper()} with the direct-term gate")
    bs = []
    for x in D["runs"]:
        if x["robot"] != n:
            continue
        for rec in x["rows"]:
            for c in ("B0.4+", "B0.4-"):
                p = planned(rec["cases"][c])
                if p is not None:
                    bs.append(min((SPEC - y) / (d / 0.4) for y, d in zip(p["Y"], p["D"])))
    a2.hist(bs, bins=np.linspace(0.08, 0.26, 37), color=col, alpha=0.55, label=f"{n.upper()} ({len(bs)} presses)")
for v, ls in ((0.2, "--"), (0.3, ":")):
    a2.axvline(v, color="k", lw=0.8, ls=ls, label=f"{v:g} N")
a1.set_xlabel("sensor bias bound B = true bias, worst direction (N)")
a1.set_ylabel("coverage of balance-envelope cases (%)")
a1.set_ylim(-5, 105)
a2.set_xlabel("largest bias the gate certifies, B* (N)")
a2.set_ylabel("planned presses")
for a in (a1, a2):
    a.grid(alpha=0.3)
    a.legend(fontsize=8)
fig.suptitle(f"Milestone 66: pricing the bias's direct term (held-out section M, seed {D['seed']})", fontsize=10)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=130)
print("wrote figure.png")
