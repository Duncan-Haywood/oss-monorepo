"""Power of a kernel MMD test vs a gradient-boosted C2ST for wrong pendulum twins. Writes results.json/results.txt.

    python experiments/run.py      # a few minutes on 4 CPUs
Rejection = statistic above the 95th percentile of the same statistic for the exact twin (null).
"""
import json, sys
from pathlib import Path
import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import mmd

NS, REPS_MMD, REPS_C2 = (100, 200, 400), 200, 24
TWINS = {"null": mmd.REAL,
         "coul-10%": dict(mmd.REAL, coul=0.27),
         "coul-20%": dict(mmd.REAL, coul=0.24),
         "gauss-noise": dict(mmd.REAL, kind="gauss"),
         "noise-sd+25%": dict(mmd.REAL, sd=0.025)}
# detectors: (name, statistic function of (real, twin, seed))
DET = {"mmd/raw": lambda a, b, s: mmd.mmd2(mmd.features(a, "raw"), mmd.features(b, "raw")),
       "mmd/resid": lambda a, b, s: mmd.mmd2(mmd.features(a, "resid"), mmd.features(b, "resid")),
       "c2st/raw": lambda a, b, s: mmd.c2st_auc(a, b, "raw", s)}
REPS = {"mmd/raw": REPS_MMD, "mmd/resid": REPS_MMD, "c2st/raw": REPS_C2}

res = {}
for n in NS:
    for d, fn in DET.items():
        vals = {}
        for name, cfg in TWINS.items():
            v = []
            for r in range(REPS[d]):
                rng = np.random.default_rng(7919 * r + n)
                real = mmd.sample(rng, n, **mmd.REAL)
                tw = mmd.sample(rng, n, **cfg)
                v.append(fn(real, tw, r))
            vals[name] = v
        thr = mmd.threshold(vals["null"])
        for name in TWINS:
            if name != "null":
                res[f"{n}|{d}|{name}"] = mmd.power(vals[name], thr)
        res[f"{n}|{d}|null"] = mmd.power(vals["null"], thr)  # sanity: ~0.05 by construction
        print(n, d, "done", flush=True)

json.dump(res, open(HERE / "results.json", "w"), indent=1)
out = [f"Real system: {mmd.REAL}. Rejection threshold = 95th percentile of the exact twin's statistic at the same n.",
       f"Replicates per cell: MMD {REPS_MMD}, C2ST {REPS_C2}. Power with Wilson 95% interval. Null rows are 0.05 by construction (<= because of ties/quantile).",
       f"{'twin':<14}{'n':>5}  " + "  ".join(f"{d:<24}" for d in DET)]
for name in TWINS:
    for n in NS:
        cells = "  ".join("{:<24}".format("%.2f [%.2f,%.2f]" % res[f"{n}|{d}|{name}"]) for d in DET)
        out.append(f"{name:<14}{n:>5}  {cells}")
(HERE / "results.txt").write_text("\n".join(out) + "\n")
print("\n".join(out))
