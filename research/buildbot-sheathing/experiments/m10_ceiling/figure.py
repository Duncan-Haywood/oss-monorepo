"""Figure for milestone 10: Shapley shares of the straight-stud ceiling, and the remedies."""
import json
import os

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
d = json.load(open(os.path.join(HERE, "results.json")))
fig, (a, b) = plt.subplots(1, 2, figsize=(11, 4.2))
src = ["tool", "stud", "edge", "slide", "ledger", "panel"]
cols = ["#4c72b0", "#8172b2", "#64b5cd", "#dd8452", "#c44e52", "#937860"]
for i, (rock, v) in enumerate(d["B"].items()):
    left = 0.0
    for s, c in zip(src, cols):
        w = v["phi"][s] / v["total"]
        a.barh(i, w, left=left, color=c, label=s if i == 0 else None)
        left += w
a.set_yticks([0, 1], [f"{k}\nclean {v['clean_all']:.3f}" for k, v in d["B"].items()])
a.set_xlabel("Shapley share of -ln(clean), straight studs")
a.set_xlim(0, 1)
a.legend(ncol=3, fontsize=8, loc="upper center", bbox_to_anchor=(0.5, -0.18))
a.set_title("What the single-2x ceiling is made of")
rem = ["none", "slide 0.5 mm", "shim 0.5 mm", "slide+shim 0.5 mm", "slide+shim 0.25 mm"]
studs = ["straight", "low, mid push", "high, mid push"]
for j, st in enumerate(studs):
    for k, rock in enumerate(d["B"]):
        ys = [next(c["clean"] for c in d["C"] if c["rock"] == rock and c["studs"] == st and c["remedy"] == r)
              for r in rem]
        b.plot(range(len(rem)), ys, marker="o", ls="-" if k else "--", color=cols[j],
               label=f"{st} ({rock.split()[0]})")
b.axhline(0.95, color="k", lw=0.8, ls=":")
b.set_ylim(0.65, 0.97)
b.set_xticks(range(len(rem)), rem, rotation=20, fontsize=8)
b.set_ylabel("first-pass clean sheets, single 2x")
b.set_title("Placement remedies (dashed: three-foot rock)")
b.legend(fontsize=7)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=130)
