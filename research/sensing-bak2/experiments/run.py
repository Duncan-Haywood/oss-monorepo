"""Sweeps for sensing-bak2. Writes results.txt (stdout is the same text).

    PYTHONPATH=src python experiments/run.py
"""
import sys
from pathlib import Path
import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from sensing_bak2 import run_trial  # noqa: E402

SEEDS = 6


def cell(**kw):
    rs = [run_trial(seed=s, **kw) for s in range(SEEDS)]
    return {k: float(np.mean([r[k] for r in rs])) for k in rs[0]}


def row(label, c):
    return (f"{label} {c['tri']:.4f} {c['fixed']:.4f} {c['none']:.4f} {c['k1']:.4f} {c['k1k2']:.4f} "
            f"{c['k1_of_k1']:+.3f} {c['k1_est']:+.3f} {c['k2_est']:+.3f} {c['f_err']:.4f}")


HEAD = "tri  fixed  none  k1  k1k2  k1_of_k1  k1_est  k2_est  f_err"


def main():
    out = []
    p = out.append
    p(f"sensing-bak2: images rendered with k1, k2; the solver fits none, k1, or k1 and k2. {SEEDS} seeds per cell, 300 features. Synthetic only.")
    p("Default cell: 12-view full orbit, 0.5 px noise, pose error 0.5 deg/axis and 0.02 radii/axis, true focal 800 px, focal told correctly.")
    p("Mean surface error in object radii (similarity-aligned). fixed = focal held, no distortion; none = focal free, no distortion;")
    p("k1 = focal and k1 free; k1k2 = focal, k1, k2 free (the rendering model). k1_of_k1 = k1 estimated by the k1 model; k1_est, k2_est, f_err from k1k2.")
    p("")
    p("== A. k1 = -0.2 fixed, true k2 swept")
    p("k2  " + HEAD)
    for k2 in [-0.2, -0.1, 0.0, 0.1, 0.2, 0.4]:
        p(row(f"{k2:+.1f}", cell(k1_true=-0.2, k2_true=k2)))
    p("")
    p("== B. k2 = +0.5 |k1| (barrel centre, pincushion edge), true k1 swept")
    p("k1  " + HEAD)
    for k1 in [-0.05, -0.1, -0.2, -0.3, -0.4]:
        p(row(f"{k1:+.2f}", cell(k1_true=k1, k2_true=-0.5 * k1)))
    p("")
    p("== C. pixel noise (px), k1 = -0.2, k2 = +0.1")
    p("sigma  " + HEAD)
    for s in [0.1, 0.5, 1.0, 2.0]:
        p(row(f"{s}", cell(sigma_px=s, k1_true=-0.2, k2_true=0.1)))
    p("")
    p("== D. views, k1 = -0.2, k2 = +0.1")
    p("views  " + HEAD)
    for v in [6, 8, 12, 24]:
        p(row(f"{v}", cell(n_views=v, k1_true=-0.2, k2_true=0.1)))
    text = "\n".join(out) + "\n"
    (HERE / "results.txt").write_text(text)
    print(text, end="")


if __name__ == "__main__":
    main()
