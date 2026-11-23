"""Figure for milestone 71: python experiments/m71_allowance/figure.py (reads results.json).

Left: each press's drift allowance a (N) at a 0.4 N bias bound, sorted, per robot (Y from the run). Right: the
worst row (mm) of each planned press at 0.9 a0 and 1.1 a0 against its table allowance a0, with the 0.03 mm spec."""
import json
import os

import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, "results.json")))
SPEC, AX = D["spec_mm"], ("y", "z", "yd", "zd")


def planned(r):
    if "out" not in r:
        return None
    if r["out"].get("y") is not None:
        return r["out"]
    e = r.get("esc", {})
    if e.get("Mu") is not None and e.get("u"):
        return e["u"]
    if e.get("S") is not None and e.get("s"):
        return e["s"]
    return None


fig, (a1, a2) = plt.subplots(1, 2, figsize=(10.5, 4.4))
for n, col in (("g1", "C0"), ("h1", "C3")):
    al = np.sort(np.array(D["AL"][n]["all"]))
    a1.plot(100 * (np.arange(len(al)) + 0.5) / len(al), al, color=col, label=f"{n.upper()} (median {np.median(al):.3f} N)")
    for tag, mk, fc in (("0.9a", "o", "none"), ("1.1a", "^", col)):
        xs, ys = [], []
        for x in D["runs"]:
            if x["robot"] != n:
                continue
            for rec in x["rows"]:
                if not rec["cases"]:
                    continue
                for sc in "+-":
                    p = planned(rec["cases"][tag + sc])
                    if p is not None:
                        xs.append(rec["a0"])
                        ys.append(max(p[k] for k in AX))
        a2.scatter(xs, ys, s=10, marker=mk, edgecolors=col, facecolors=fc, linewidths=0.6,
                   label=f"{n.upper()}, drift {tag.replace('a', ' a0')}")
a1.set_xlabel("presses, percentile")
a1.set_ylabel("drift allowance a at B = 0.4 N, N")
a1.set_title("How far the bias may drift, per press")
a1.legend(fontsize=7)
a2.axhline(SPEC, color="k", lw=0.8, ls="--")
a2.set_xlabel("table allowance a0 of the press, N")
a2.set_ylabel("worst row of the press, mm")
a2.set_title("Just under the allowance: in spec; just over: out")
a2.legend(fontsize=7)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=130)
print("wrote figure.png")
