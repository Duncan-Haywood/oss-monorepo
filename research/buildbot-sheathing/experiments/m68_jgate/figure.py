"""Figure for milestone 68: python experiments/m68_jgate/figure.py (reads results.json).

Left: gate coverage (share of balance-envelope cases the gate Y_k + B ||J_k||_table <= 0.03 mm passes) against the
bias bound B, per robot and adversary, beside the chain's own coverage with no gate. Right: the worst row of each
planned press against B, gate-passed presses filled and refused ones hollow, with the 0.03 mm spec."""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, "results.json")))
SPEC, BS, S = D["spec_mm"], D["bs"], D["S"]
AX = ("y", "z", "yd", "zd")


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
for i, (n, col) in enumerate((("g1", "C0"), ("h1", "C3"))):
    for a, ls in (("dir", "-"), ("m63", ":")):
        a1.plot(BS, [S[f"{n} {b:g} {a}"]["gcov"] for b in BS], ls, color=col, marker="o",
                label=f"{n.upper()} gate, {a} bias")
    a1.plot(BS, [S[f"{n} {b:g} dir"]["ccov"] for b in BS], "--", color=col, alpha=0.5, label=f"{n.upper()} chain, no gate")
    tab = D["table"][n]
    for j, b in enumerate(BS):
        wp, wr = [], []
        for x in D["runs"]:
            if x["robot"] != n:
                continue
            for rec in x["rows"]:
                gn = tab.get(str(rec["pose"]))
                for sc in ("+", "-"):
                    p = planned(rec["cases"][f"dir{b:g}{sc}"])
                    if p is None:
                        continue
                    w = max(p[k] for k in AX)
                    ok = gn is not None and all(y + b * g <= SPEC + 1e-12 for y, g in zip(p["Y"], gn))
                    (wp if ok else wr).append(w)
        rng = np.random.default_rng(j + 10 * i)
        off = b + (i - 0.5) * 0.03
        a2.scatter(off + rng.uniform(-0.008, 0.008, len(wp)), wp, s=9, color=col, alpha=0.6,
                   label=f"{n.upper()} gate-passed" if j == 0 else None)
        a2.scatter(off + rng.uniform(-0.008, 0.008, len(wr)), wr, s=9, facecolors="none", edgecolors=col, alpha=0.4,
                   label=f"{n.upper()} refused" if j == 0 else None)
a1.set_xticks(BS)
a1.set_ylim(0, 105)
a1.set_xlabel("bias bound B = planner bound (N)")
a1.set_ylabel("coverage of balance-envelope cases (%)")
a2.axhline(SPEC, color="k", lw=0.8, ls="--", label=f"spec {SPEC} mm")
a2.set_xticks(BS)
a2.set_xlabel("direct-aimed bias B (N)")
a2.set_ylabel("worst row of a planned press (mm)")
for a in (a1, a2):
    a.grid(alpha=0.3)
    a.legend(fontsize=7)
fig.suptitle(f"Milestone 68: the per-pose sensitivity gate (held-out section O, seed {D['seed']})", fontsize=10)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=130)
print("wrote figure.png")
