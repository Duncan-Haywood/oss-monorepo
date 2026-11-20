"""Figure for milestone 63: python experiments/m63_worstbias/figure.py (reads results.json).

Per pose and load planned under both error sets, the worst four-row residual under the two adversarial signs against
the worst under the 6 random directions."""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, "results.json")))
AX = ("y", "z", "yd", "zd")
SPEC = D["spec_mm"]


def worst(r):
    if "out" not in r:
        return None
    o = r["out"]
    if o.get("y") is None:
        e = r.get("esc", {})
        o = e.get("u") if e.get("Mu") is not None else (e.get("s") if e.get("S") is not None else None)
    return None if not o or o.get("y") is None else max(o[a] for a in AX)


fig, axes = plt.subplots(1, 2, figsize=(10.5, 4.6))
for ax, n in zip(axes, ("g1", "h1")):
    xs, ys = [], []
    for x in D["runs"]:
        if x["robot"] != n:
            continue
        for rec in x["rows"]:
            a = [worst(rec["cases"][c]) for c in ("adv+", "adv-")]
            r = [worst(rec["cases"][f"r{i}"]) for i in range(6)]
            if any(v is None for v in a + r):
                continue
            xs.append(max(r))
            ys.append(max(a))
    ax.scatter(xs, ys, s=8, color="C3", alpha=0.6)
    ax.plot([0, SPEC], [0, SPEC], color="0.5", lw=0.7, ls=":", label="equal")
    ax.axhline(SPEC, color="k", lw=0.7, ls="--", label=f"{SPEC:g} mm spec")
    ax.axvline(SPEC, color="k", lw=0.7, ls="--")
    ax.set_xlim(0, SPEC * 1.08)
    ax.set_ylim(0, SPEC * 1.08)
    ax.set_xlabel("worst residual, 6 random 0.2 N biases (mm)")
    ax.set_ylabel("worst residual, worst-direction 0.2 N bias (mm)")
    ax.set_title(f"{n.upper()}: worst-direction against random bias (seed {D['seed']}, {len(xs)} pose-loads)",
                 fontsize=10)
    ax.legend(fontsize=7, loc="upper left")
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=110)
print("wrote figure.png")
