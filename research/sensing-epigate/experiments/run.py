"""Sweeps for sensing-epigate. Writes results.txt (stdout is the same text).

    PYTHONPATH=src python experiments/run.py
"""
import sys
from pathlib import Path
import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from sensing_epigate import run_trial  # noqa: E402

SEEDS = 6
KEYS = ["clean_ba", "tri", "cauchy", "ri_cauchy", "g_tri", "g_linear", "g_cauchy", "recall", "lost", "cover"]


def _one(args):
    kw, s = args
    return run_trial(seed=s, **kw)


def row(pool, label, **kw):
    rs = pool.map(_one, [(kw, s) for s in range(SEEDS)])
    m = {k: float(np.nanmean([r[k] for r in rs])) for k in KEYS}
    return f"{label} " + " ".join(f"{m[k]:.4f}" for k in KEYS)


def main():
    from multiprocessing import Pool
    out = []
    p = out.append
    hdr = " ".join(KEYS) + "   (surface error in object radii; recall, lost, cover are fractions)"
    p(f"sensing-epigate: epipolar gate before bundle adjustment, {SEEDS} seeds per cell, 300 features. Synthetic only.")
    p("Default cell: 12 views, 0.5 px noise, pose error 0.5 deg / 0.02 radii, 300 function evaluations, gate 2 px Sampson, vote 0.5.")
    p("tri/cauchy/ri_cauchy: no gate (all-view start; Cauchy BA; RANSAC start + Cauchy BA). g_*: after the gate. recall = mismatches removed,")
    p("lost = good observations removed, cover = share of the clean-data points still triangulable. All scored on the same points.")
    with Pool(4) as pool:
        for kind in ["uniform", "near", "along"]:
            p("")
            p(f"== {kind[0].upper()}. {kind} mismatches, fraction (12 views)")
            p("frac " + hdr)
            for f in [0.0, 0.05, 0.1, 0.2]:
                p(row(pool, f, kind=kind, frac=f))
        p("")
        p("== D. views, 10% along-epipolar-line mismatches")
        p("views " + hdr)
        for v in [8, 12, 24]:
            p(row(pool, v, kind="along", frac=0.1, n_views=v))
        p("")
        p("== E. gate threshold (px, Sampson), 10% near mismatches")
        p("thresh " + hdr)
        for t in [0.5, 1.0, 2.0, 4.0]:
            p(row(pool, t, kind="near", frac=0.1, thresh_px=t))
    text = "\n".join(out)
    print(text)
    (HERE / "results.txt").write_text(text + "\n")


if __name__ == "__main__":
    main()
