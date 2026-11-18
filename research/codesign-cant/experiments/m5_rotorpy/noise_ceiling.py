"""Post-hoc check for milestone 5, written after reading results.txt: how stable is the top-ten ranking inside the stylised simulator
itself? Re-scores the same 60 designs in the stylised simulator on five fresh 32-episode held-out sets (seeds 9001-9005) and reports
Spearman rho against the seed-9999 scores (all 60 and the top ten), the spread of the top ten, and the rank agreement of the six
law x cant arms (mean J) between the stylised simulator and each RotorPy condition. Writes noise_ceiling.txt."""
import json, os, sys
import numpy as np
from scipy.stats import spearmanr

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import run as R  # noqa: E402

d = json.load(open(os.path.join(HERE, "results.json")))
ds = d["designs"]
base = np.array([r["stylised"]["J"] for r in ds])
top = np.argsort(-base)[:10]
lines = ["Post-hoc (written after reading results.txt): the stylised simulator against itself on fresh held-out episodes",
         f"top ten by seed-9999 stylised J span {base[top].min():.3f} to {base[top].max():.3f} (spread {base[top].max() - base[top].min():.3f}); "
         f"all 60 span {base.min():.2f} to {base.max():.2f}",
         "fresh seed  rho all   rho top10"]
rt = []
for s in range(9001, 9006):
    J = []
    for r in ds:
        R.SEED = s
        J.append(R.stylised(r["i"])["J"])
    J = np.array(J)
    a, b = spearmanr(base, J).statistic, spearmanr(base[top], J[top]).statistic
    rt.append(b)
    lines.append(f"{s}        {a:6.3f}    {b:6.3f}")
lines.append(f"mean top-ten rho of the stylised simulator against itself: {np.mean(rt):.3f} (range {min(rt):.3f} to {max(rt):.3f})")
arms = [(c, cap) for c in ("pid", "indi", "geo") for cap in (0, 80)]
lines += ["", "Six arms (law x cant bound), mean J; rank agreement with the stylised simulator"]
mean = lambda m: [np.mean([r[m]["J"] for r in ds if (r["ctrl"], r["cap"]) == a]) for a in arms]
st = mean("stylised")
lines.append("arm order: " + ", ".join(f"{c}/{cap}" for c, cap in arms))
lines.append(f"stylised   " + " ".join(f"{v:7.2f}" for v in st))
for m in ("torque", "aero", "aero_cop", "aero_cop2"):
    v = mean(m)
    lines.append(f"{m:10s} " + " ".join(f"{x:7.2f}" for x in v) + f"   rho {spearmanr(st, v).statistic:.3f}")
open(os.path.join(HERE, "noise_ceiling.txt"), "w").write("\n".join(lines) + "\n")
print("\n".join(lines))
