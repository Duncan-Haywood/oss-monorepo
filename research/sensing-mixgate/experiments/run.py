"""Gate vs RANSAC start vs plain Cauchy under measured SIFT mismatch mixes. Writes results.txt.

    PYTHONPATH=src python experiments/run.py
"""
import sys
from pathlib import Path
import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from sensing_mixgate import MIXES, run_mixed  # noqa: E402

SEEDS = 6
KEYS = ["clean_ba", "tri", "cauchy", "ri_cauchy", "g_cauchy", "recall", "lost", "cover"]


def _one(a):
    label, kw, s = a
    return run_mixed(label, seed=s, **kw)


def row(pool, name, label, **kw):
    rs = pool.map(_one, [(label, kw, s) for s in range(SEEDS)])
    return f"{name} " + " ".join(f"{float(np.nanmean([r[k] for r in rs])):.4f}" for k in KEYS)


def main():
    from multiprocessing import Pool
    out = []
    p = out.append
    p(f"sensing-mixgate: sensing-epigate's trial with SIFT mismatch mixes measured in sensing-matchreal, {SEEDS} seeds per cell. Synthetic geometry, measured mismatch mix.")
    p("12 views, 300 features, 0.5 px noise, pose error 0.5 deg / 0.02 radii, gate 2 px Sampson, vote 0.5. Surface error in object radii.")
    hdr = "ratio rate " + " ".join(KEYS)
    with Pool(4) as pool:
        p("")
        p("== A. measured mix at each ratio-test threshold (rate, then along/near/far shares in MIXES)")
        p(hdr)
        for lab, (rate, *_s) in MIXES.items():
            p(row(pool, f"{lab} {rate}", lab))
        p("")
        p("== B. same rates, all mismatches uniform random pixels (sensing-epigate's original assumption)")
        p(hdr)
        for lab, (rate, *_s) in MIXES.items():
            p(row(pool, f"{lab} {rate}", lab, shares=(0, 0, 1)))
        p("")
        p("== C. same rates, all mismatches along the epipolar line (the gate's worst case)")
        p(hdr)
        for lab, (rate, *_s) in MIXES.items():
            p(row(pool, f"{lab} {rate}", lab, shares=(1, 0, 0)))
    text = "\n".join(out)
    print(text)
    (HERE / "results.txt").write_text(text + "\n")


if __name__ == "__main__":
    main()
