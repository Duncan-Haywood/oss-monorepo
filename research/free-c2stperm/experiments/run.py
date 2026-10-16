"""Size and power of the permutation-calibrated cross-validated C2ST. Writes results.json and results.txt.

    python experiments/run.py      # about 1 hour on 4 CPUs
"""
import os
os.environ.setdefault("OMP_NUM_THREADS", "1")
import json, sys
from pathlib import Path
from joblib import Parallel, delayed

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import perm
import exact

ALPHA, B = 0.05, 39   # (B+1) * alpha = 2 is an integer, so the permutation test has exact size 0.05
RULES = ("cv_naive", "cv_perm", "holdout")
NULL = dict(perm.REAL)
# (label, twin parameters, features, sample sizes, replicates)
SCENARIOS = [
    ("exact twin (null), raw", NULL, "raw", (100, 200), 100),
    ("Coulomb -10%, raw", dict(NULL, coul=0.27), "raw", (200,), 60),
]


def main():
    out, lines = [], [
        f"One-sided rejection rate at alpha={ALPHA}: share of replicates with p<=alpha (Wilson 95% interval). Real system {perm.REAL}.",
        f"cv_perm: 5-fold CV pooled AUROC, p-value from {B} label permutations (exact size {ALPHA}); cv_naive and holdout as in free-c2stexact, same data.",
        "Each replicate draws fresh n real + n twin trajectories; HistGradientBoosting (60 iterations). Under the null the rate should be about 0.05.",
        "",
    ]
    for label, params, feat, ns, reps in SCENARIOS:
        lines.append(f"== {label}  ({reps} replicates per n)")
        lines.append(f"{'n':>5}  " + "  ".join(f"{r:>22}" for r in RULES))
        for n in ns:
            ps = Parallel(n_jobs=4)(delayed(perm.replicate)(1000 + i, n, params, feat, B) for i in range(reps))
            row, cells = {}, []
            for r in RULES:
                k = sum(p[r] <= ALPHA for p in ps)  # <=: the permutation p-value lives on the grid k/(B+1), and 2/40 = 0.05 is the exact-size rejection
                lo, hi = exact.wilson(k, reps)
                row[r] = dict(k=k, reps=reps, rate=k / reps, lo=lo, hi=hi)
                cells.append(f"{k / reps:5.3f} [{lo:4.2f},{hi:4.2f}]".rjust(22))
            lines.append(f"{n:>5}  " + "  ".join(cells))
            out.append(dict(scenario=label, n=n, results=row, pvalues=ps))
            print(lines[-1], flush=True)
        lines.append("")
    (HERE / "results.txt").write_text("\n".join(lines) + "\n")
    (HERE / "results.json").write_text(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
