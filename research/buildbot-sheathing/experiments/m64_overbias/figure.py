"""Figure for milestone 64: python experiments/m64_overbias/figure.py (reads results.json).

Left: worst and 99th-percentile four-row residual of planned presses against the true bias (the planner sized to
0.2 N). Right: coverage of the balance envelope and the share of planned presses over the spec, against the bias."""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, "results.json")))
AX = ("y", "z", "yd", "zd")
SPEC, B, BETAS = D["spec_mm"], D["B"], D["betas"]


def worst(r):
    if "out" not in r:
        return None
    o = r["out"]
    if o.get("y") is None:
        e = r.get("esc", {})
        o = e.get("u") if e.get("Mu") is not None else (e.get("s") if e.get("S") is not None else None)
    return None if not o or o.get("y") is None else max(o[a] for a in AX)


fig, (a1, a2) = plt.subplots(1, 2, figsize=(10.5, 4.4))
xb = [b * B for b in BETAS]
for n, col in (("g1", "C0"), ("h1", "C3")):
    mx, p99, over = [], [], []
    for b in BETAS:
        w = [worst(rec["cases"][f"b{b:g}{s}"]) for x in D["runs"] if x["robot"] == n for rec in x["rows"]
             for s in "+-"]
        w = [v for v in w if v is not None]
        mx.append(max(w))
        p99.append(float(np.percentile(w, 99)))
        over.append(100.0 * sum(v > SPEC + 1e-12 for v in w) / len(w))
    a1.plot(xb, mx, "o-", color=col, label=f"{n.upper()} worst")
    a1.plot(xb, p99, "s--", color=col, alpha=0.6, label=f"{n.upper()} 99th percentile")
    a2.plot(xb, over, "o-", color=col, label=f"{n.upper()} planned presses over spec")
    a2.plot(xb, [D["S"][f"{n} {b:g}"]["cov"] - 100.0 for b in BETAS], "s--", color=col, alpha=0.6,
            label=f"{n.upper()} coverage minus 100")
a1.axhline(SPEC, color="k", lw=0.7, ls="--", label=f"{SPEC:g} mm spec")
for a in (a1, a2):
    a.axvline(B, color="0.5", lw=0.7, ls=":")
    a.set_xlabel("true sensor bias along the adversarial direction (N); planner sized to 0.2 N (dotted)")
a1.set_ylabel("four-row residual (mm)")
a2.set_ylabel("percent")
a1.set_title(f"Residual past the design bound (seed {D['seed']})", fontsize=10)
a2.set_title("Presses over spec and coverage lost", fontsize=10)
a1.legend(fontsize=7)
a2.legend(fontsize=7)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=110)
print("wrote figure.png")
