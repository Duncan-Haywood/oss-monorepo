"""Sweeps for sensing-ba. Writes results.txt (stdout is the same text).

    PYTHONPATH=src python experiments/run.py
"""
import sys
from pathlib import Path
import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from sensing_ba import run_trial  # noqa: E402

SEEDS = 8


def cell(**kw):
    rs = [run_trial(seed=s, **kw) for s in range(SEEDS)]
    return {k: float(np.mean([r[k] for r in rs])) for k in rs[0]}


def row(label, **kw):
    c = cell(**kw)
    return (f"{label} {c['true_pose']:.4f} {c['tri']:.4f} {c['tri_aligned']:.4f} {c['ba']:.4f} "
            f"{c['tri_aligned'] / c['ba']:.1f}")


def main():
    out = []
    p = out.append
    hdr = "true_pose  tri  tri_aligned  ba  tri_aligned/ba   (mean surface error, object radii)"
    p(f"sensing-ba: bundle adjustment on the sensing-recon rig, {SEEDS} seeds per cell, 300 features. Synthetic only.")
    p("Default cell: 12-view full orbit, 0.5 px noise, camera pose error 0.5 deg/axis rotation and 0.02 radii/axis position.")
    p("Free bundle adjustment, scored after a similarity alignment to the true points. tri = pose-error triangulation, unaligned.")
    p("")
    p("== A. rotation error per axis (deg), position error 0.02")
    p("rot " + hdr)
    for r in [0.0, 0.25, 0.5, 1.0, 2.0, 4.0]:
        p(row(r, rot_deg=r))
    p("")
    p("== B. position error per axis (radii), rotation error 0.5 deg")
    p("trans " + hdr)
    for t in [0.0, 0.01, 0.02, 0.05, 0.1, 0.2]:
        p(row(t, trans=t))
    p("")
    p("== C. views, default errors")
    p("views " + hdr)
    for v in [4, 6, 8, 12, 24]:
        p(row(v, n_views=v))
    p("")
    p("== D. pixel noise, default errors")
    p("sigma_px " + hdr)
    for s in [0.1, 0.25, 0.5, 1.0, 2.0, 4.0]:
        p(row(s, sigma_px=s))
    p("")
    p("== E. free adjustment against a MAP adjustment with the pose-error sigma as prior")
    p("prior " + hdr)
    for pr in [False, True]:
        p(row(pr, prior=pr, rot_deg=1.0, trans=0.05))
    text = "\n".join(out)
    print(text)
    (HERE / "results.txt").write_text(text + "\n")


if __name__ == "__main__":
    main()
