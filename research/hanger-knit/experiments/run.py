"""Design a hanger for each case (CMA-ES and random search, 3 seeds each), then cross-score.

python3 experiments/run.py      # about 10 min on 4 cores; writes results.txt
"""
import multiprocessing as mp
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from hanger_knit.knit import CASES, design, shape_err  # noqa: E402
from hanger_fit.model import STOCK  # noqa: E402

BUDGET, SEEDS = 150, (0, 1, 2)


def job(a):
    name, method, seed = a
    h, e, _ = design(name, method, seed, BUDGET)
    return a, h, e


if __name__ == "__main__":
    jobs = [(n, m, s) for n in CASES for m in ("cmaes", "random") for s in SEEDS]
    with mp.Pool(4) as p:
        res = p.map(job, jobs)
    out = [f"budget {BUDGET} scores per run, seeds {list(SEEDS)}; shape error cm RMS, size M tee, no crease charge",
           "== A. design runs: case method seed err w slope bow r"]
    best = {}
    for (n, m, s), h, e in res:
        out.append(f"{n} {m} {s} {e:.3f} {h.w:.2f} {h.slope:.1f} {h.bow:.2f} {h.r:.2f}")
        if m == "cmaes" and (n not in best or e < best[n][1]):
            best[n] = (h, e)
    out.append("== B. best CMA-ES hanger per case: case err w slope bow r")
    for n, (h, e) in best.items():
        out.append(f"{n} {e:.3f} {h.w:.2f} {h.slope:.1f} {h.bow:.2f} {h.r:.2f}")
    out.append("== C. cross-score: hanger designed for (row) scored on case (column), cm RMS")
    cols = list(CASES)
    out.append("designed_for " + " ".join(cols))
    for n, (h, _) in best.items():
        out.append(n + " " + " ".join(f"{shape_err(h, c):.3f}" for c in cols))
    out.append("stock wood-shaped (hanger-fit) " + " ".join(f"{shape_err(STOCK['wood-shaped'], c):.3f}" for c in cols))
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))
