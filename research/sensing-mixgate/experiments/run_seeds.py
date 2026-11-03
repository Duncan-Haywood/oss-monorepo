"""24-seed rerun of sensing-mixgate with medians and bootstrap 95% intervals. Writes results_seeds.txt.

    PYTHONPATH=src python experiments/run_seeds.py [SEEDS]

Per-seed scores are also written to results_seeds.json so the summary can be recomputed
without rerunning (about 25 minutes on 4 cores at 24 seeds)."""
import json
import sys
from pathlib import Path
import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from sensing_mixgate import MIXES, run_mixed  # noqa: E402

SEEDS = int(sys.argv[1]) if len(sys.argv) > 1 else 24
METHODS = ["cauchy", "ri_cauchy", "g_cauchy"]
TABLES = {"A": {}, "B": {"shares": (0, 0, 1)}, "C": {"shares": (1, 0, 0)}}


def _one(a):
    label, kw, s = a
    r = run_mixed(label, seed=s, **kw)
    return {k: float(r[k]) for k in METHODS + ["clean_ba"]}


def ci(x, rng, stat=np.median, n=2000):
    x = np.asarray(x, float)
    x = x[np.isfinite(x)]
    b = [stat(rng.choice(x, len(x))) for _ in range(n)]
    return float(stat(x)), float(np.percentile(b, 2.5)), float(np.percentile(b, 97.5))


def summarize(raw, seeds):
    rng = np.random.default_rng(0)
    out = [f"sensing-mixgate, {seeds} seeds per cell: median [95% bootstrap interval of the median] of surface error (object radii),",
           "and 'fail' = share of seeds above 0.05 (the point where the reconstruction is visibly wrong). Synthetic geometry, measured mismatch mix.", ""]
    for t in TABLES:
        out.append(f"== {t}")
        out.append("ratio rate | " + " | ".join(f"{m} median [lo, hi] fail" for m in METHODS) + " | g_cauchy<ri_cauchy in")
        for lab, (rate, *_s) in MIXES.items():
            rs = raw[t][lab]
            cells = []
            for m in METHODS:
                v = [r[m] for r in rs]
                med, lo, hi = ci(v, rng)
                fail = float(np.mean(np.asarray(v) > 0.05))
                cells.append(f"{med:.4f} [{lo:.4f}, {hi:.4f}] {fail:.2f}")
            wins = sum(r["g_cauchy"] < r["ri_cauchy"] for r in rs)
            out.append(f"{lab} {rate} | " + " | ".join(cells) + f" | {wins}/{len(rs)}")
        out.append("")
    return "\n".join(out)


def main():
    from multiprocessing import Pool
    raw = {}
    with Pool(4) as pool:
        for t, kw in TABLES.items():
            raw[t] = {}
            for lab in MIXES:
                raw[t][lab] = pool.map(_one, [(lab, kw, s) for s in range(SEEDS)])
                print(t, lab, "done", flush=True)
    (HERE / "results_seeds.json").write_text(json.dumps(raw))
    text = summarize(raw, SEEDS)
    print(text)
    (HERE / "results_seeds.txt").write_text(text + "\n")


if __name__ == "__main__":
    main()
