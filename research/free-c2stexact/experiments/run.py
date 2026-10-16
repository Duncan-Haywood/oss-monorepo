"""Rejection rates of three C2ST significance rules. Writes results.json and results.txt next to this file.

    python experiments/run.py      # about 15-25 minutes on 4 CPUs
"""
import os
os.environ.setdefault("OMP_NUM_THREADS", "1")
import json, sys
from pathlib import Path
from joblib import Parallel, delayed

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import exact

ALPHA = 0.05
RULES = ("cv_naive", "cv_fold_t", "holdout")
NULL = dict(exact.REAL)
# (label, twin parameters, features, sample sizes, replicates)
SCENARIOS = [
    ("exact twin (null), raw", NULL, "raw", (100, 200, 400), 200),
    ("exact twin (null), raw+resid", NULL, "raw+resid", (100, 200, 400), 200),
    ("Coulomb -10%, raw", dict(NULL, coul=0.27), "raw", (100, 200, 400), 100),
    ("Gaussian noise same sd, raw+resid", dict(NULL, kind="gauss"), "raw+resid", (50, 100), 100),
]


def one(seed, n, params, feat):
    return exact.replicate(seed, n, params, feat)


def main():
    out, lines = [], [
        f"One-sided rejection rate at alpha={ALPHA}: share of replicates with p<alpha (Wilson 95% interval). Real system {exact.REAL}.",
        "Each replicate draws fresh n real + n twin trajectories; HistGradientBoosting (60 iterations). Under the null the rate should be about 0.05.",
        "",
    ]
    for label, params, feat, ns, reps in SCENARIOS:
        lines.append(f"== {label}  ({reps} replicates per n)")
        lines.append(f"{'n':>5}  " + "  ".join(f"{r:>22}" for r in RULES))
        for n in ns:
            ps = Parallel(n_jobs=4)(delayed(one)(1000 + i, n, params, feat) for i in range(reps))
            row, cells = {}, []
            for r in RULES:
                k = sum(p[r] < ALPHA for p in ps)
                lo, hi = exact.wilson(k, reps)
                row[r] = dict(k=k, reps=reps, rate=k / reps, lo=lo, hi=hi)
                cells.append(f"{k / reps:5.3f} [{lo:4.2f},{hi:4.2f}]".rjust(22))
            lines.append(f"{n:>5}  " + "  ".join(cells))
            out.append(dict(scenario=label, n=n, results=row))
            print(lines[-1], flush=True)
        lines.append("")
    (HERE / "results.txt").write_text("\n".join(lines) + "\n")
    (HERE / "results.json").write_text(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
