"""Sweeps for sensing-baoutlier. Writes results.txt (stdout is the same text).

    PYTHONPATH=src python experiments/run.py
"""
import sys
from pathlib import Path
import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from sensing_baoutlier import run_trial  # noqa: E402

SEEDS = 6
KEYS = ["clean_ba", "tri", "linear", "huber", "cauchy", "trim", "ri_init", "ri_linear", "ri_cauchy", "ri_trim"]


def _one(args):
    kw, s = args
    return run_trial(seed=s, **kw)


def row(pool, label, **kw):
    rs = pool.map(_one, [(kw, s) for s in range(SEEDS)])
    m = {k: float(np.mean([r[k] for r in rs])) for k in KEYS}
    return f"{label} " + " ".join(f"{m[k]:.4f}" for k in KEYS)


def main():
    from multiprocessing import Pool
    out = []
    p = out.append
    hdr = " ".join(KEYS) + "   (mean surface error after alignment, object radii)"
    p(f"sensing-baoutlier: bundle adjustment with mismatched observations, {SEEDS} seeds per cell, 300 features. Synthetic only.")
    p("Default cell: 12-view orbit, 0.5 px noise, pose error 0.5 deg and 0.02 radii per axis, 300 function evaluations.")
    p("A mismatch replaces an observation by a uniform random pixel in the 640 x 480 image. Robust-loss scale 3 x sigma_px; trim gate 4 x sigma_px + 2 px.")
    p("clean_ba = the same adjustment on clean observations (the floor). tri = DLT on all views of the contaminated data. linear/huber/cauchy/trim")
    p("start from tri; ri_init = per-point RANSAC pair triangulation (20 px gate), ri_linear/ri_cauchy/ri_trim start from it.")
    with Pool(4) as pool:
        p("")
        p("== A. fraction of mismatched observations (12 views)")
        p("frac " + hdr)
        for f in [0.0, 0.02, 0.05, 0.1, 0.2]:
            p(row(pool, f, frac=f))
        p("")
        p("== B. views, 10% mismatches (more views per point is what lets RANSAC vote)")
        p("views " + hdr)
        for v in [8, 12, 24]:
            p(row(pool, v, frac=0.1, n_views=v))
        p("")
        p("== C. start pose error (rotation deg / position radii), 5% mismatches")
        p("start " + hdr)
        for r, t in [(0.0, 0.0), (0.5, 0.02), (2.0, 0.1)]:
            p(row(pool, f"{r}/{t}", frac=0.05, rot_deg=r, trans=t))
    text = "\n".join(out)
    print(text)
    (HERE / "results.txt").write_text(text + "\n")


if __name__ == "__main__":
    main()
