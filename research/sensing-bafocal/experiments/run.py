"""Sweeps for sensing-bafocal. Writes results.txt (stdout is the same text).

    PYTHONPATH=src python experiments/run.py
"""
import sys
from pathlib import Path
import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from sensing_bafocal import run_trial  # noqa: E402

SEEDS = 6


def cell(**kw):
    rs = [run_trial(seed=s, **kw) for s in range(SEEDS)]
    return {k: float(np.mean([r[k] for r in rs])) for k in rs[0]}


def main():
    out = []
    p = out.append
    p(f"sensing-bafocal: bundle adjustment with the focal length (and k1) as unknowns, {SEEDS} seeds per cell, 300 features. Synthetic only.")
    p("Default cell: 12-view full orbit, 0.5 px noise, pose error 0.5 deg/axis and 0.02 radii/axis, true focal 800 px, no distortion.")
    p("Mean surface error in object radii after a similarity alignment. fixed = focal held at the told value; selfcal = shared focal free;")
    p("oracle = true focal held; f_err = |estimated - true| / true focal after selfcal.")
    p("")
    p("== A. relative error of the focal length the solver is told")
    p("err  tri  fixed  selfcal  oracle  fixed/selfcal  f_err")
    for e in [-0.2, -0.1, -0.05, -0.02, 0.0, 0.02, 0.05, 0.1, 0.2]:
        c = cell(focal_err=e)
        p(f"{e:+.2f} {c['tri']:.4f} {c['fixed']:.4f} {c['selfcal']:.4f} {c['oracle']:.4f} {c['fixed'] / c['selfcal']:.1f} {c['f_err']:.4f}")
    p("")
    p("== B. views, focal told 5% too long")
    p("views  tri  fixed  selfcal  oracle  fixed/selfcal  f_err")
    for v in [4, 6, 8, 12, 24]:
        c = cell(n_views=v, focal_err=0.05)
        p(f"{v} {c['tri']:.4f} {c['fixed']:.4f} {c['selfcal']:.4f} {c['oracle']:.4f} {c['fixed'] / c['selfcal']:.1f} {c['f_err']:.4f}")
    p("")
    p("== C. pixel noise (px), focal told 5% too long")
    p("sigma  tri  fixed  selfcal  oracle  fixed/selfcal  f_err")
    for s in [0.1, 0.5, 1.0, 2.0, 4.0]:
        c = cell(sigma_px=s, focal_err=0.05)
        p(f"{s} {c['tri']:.4f} {c['fixed']:.4f} {c['selfcal']:.4f} {c['oracle']:.4f} {c['fixed'] / c['selfcal']:.1f} {c['f_err']:.4f}")
    p("")
    p("== D. unmodelled radial distortion k1 (focal told correctly). selfcal here also solves k1 (est_k1); oracle column is not comparable and omitted")
    p("k1  tri  fixed  selfcal  k1_est  f_err")
    for k in [0.0, -0.05, -0.1, -0.2, -0.3]:
        c = cell(focal_err=0.0, k1_true=k, est_k1=True)
        p(f"{k} {c['tri']:.4f} {c['fixed']:.4f} {c['selfcal']:.4f} {c['k1_est']:+.3f} {c['f_err']:.4f}")
    text = "\n".join(out) + "\n"
    (HERE / "results.txt").write_text(text)
    print(text, end="")


if __name__ == "__main__":
    main()
