"""Sweeps for sensing-recon. Writes results.txt (stdout is the same text).

    PYTHONPATH=src python experiments/run.py
"""
import sys
from pathlib import Path
import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from sensing_recon import run_trial  # noqa: E402

SEEDS = 10


def cell(**kw):
    rs = [run_trial(seed=s, **kw) for s in range(SEEDS)]
    return {k: float(np.mean([r[k] for r in rs])) for k in rs[0]}


def main():
    out = []
    p = out.append
    p(f"sensing-recon: synthetic bumpy-ellipsoid object (mean radius ~1), {SEEDS} seeds per cell, 800 features,")
    p("error = distance to the exact surface in object radii, completeness = reconstructed / 800 features. Synthetic only.")
    p("")
    p("== A. views on a full 360 degree orbit, pixel noise 0.5 px")
    p("views mean_err rms_err completeness n_points")
    for v in [2, 3, 4, 6, 8, 12, 24, 48]:
        c = cell(n_views=v, span_deg=360, sigma_px=0.5)
        p(f"{v} {c['mean_err']:.4f} {c['rms_err']:.4f} {c['completeness']:.3f} {c['n_points']:.0f}")
    p("")
    p("== B. baseline (azimuth span in degrees), 4 views, pixel noise 0.5 px")
    p("span mean_err rms_err completeness n_points")
    for sp in [2, 5, 10, 20, 40, 80, 120]:
        c = cell(n_views=4, span_deg=sp, sigma_px=0.5)
        p(f"{sp} {c['mean_err']:.4f} {c['rms_err']:.4f} {c['completeness']:.3f} {c['n_points']:.0f}")
    p("")
    p("== C. pixel noise, 12 views on a full orbit")
    p("sigma mean_err rms_err completeness n_points")
    for sg in [0.0, 0.5, 1.0, 2.0, 4.0, 8.0, 16.0, 32.0]:
        c = cell(n_views=12, span_deg=360, sigma_px=sg)
        p(f"{sg} {c['mean_err']:.4f} {c['rms_err']:.4f} {c['completeness']:.3f} {c['n_points']:.0f}")
    p("")
    p("== D. camera pose error (rotation, degrees per axis), 12 views, pixel noise 0.5 px")
    p("pose mean_err rms_err completeness n_points")
    for ps in [0.0, 0.05, 0.1, 0.25, 0.5, 1.0]:
        c = cell(n_views=12, span_deg=360, sigma_px=0.5, pose_sigma_deg=ps)
        p(f"{ps} {c['mean_err']:.4f} {c['rms_err']:.4f} {c['completeness']:.3f} {c['n_points']:.0f}")
    p("")
    p("== E. views needed for 90 percent completeness, by pixel noise (first count in 2..48 whose mean completeness >= 0.9, else none)")
    p("sigma views")
    for sg in [0.5, 4.0, 16.0]:
        found = "none"
        for v in [3, 4, 6, 8, 12, 16, 24, 48]:
            if cell(n_views=v, span_deg=360, sigma_px=sg)["completeness"] >= 0.9:
                found = str(v)
                break
        p(f"{sg} {found}")
    text = "\n".join(out) + "\n"
    (HERE / "results.txt").write_text(text)
    print(text)


if __name__ == "__main__":
    main()
