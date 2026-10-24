"""Sweeps for sensing-bak2wide. Writes results.txt (stdout is the same text).

    PYTHONPATH=src python experiments/run.py
"""
import sys
from pathlib import Path
import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from sensing_bak2wide import run_trial_wide, rig_radius_stats  # noqa: E402

SEEDS = 6
DISTS = [4.0, 3.0, 2.5, 2.2, 2.0]
HEAD = "tri  fixed  none  k1  k1k2  k1_est  k2_est  k2_sd  f_err"


def cell(**kw):
    rs = [run_trial_wide(seed=s, **kw) for s in range(SEEDS)]
    c = {k: float(np.mean([r[k] for r in rs])) for k in rs[0]}
    c["k2_sd"] = float(np.std([r["k2_est"] for r in rs]))
    return c


def row(label, c):
    return (f"{label} {c['tri']:.4f} {c['fixed']:.4f} {c['none']:.4f} {c['k1']:.4f} {c['k1k2']:.4f} "
            f"{c['k1_est']:+.3f} {c['k2_est']:+.3f} {c['k2_sd']:.3f} {c['f_err']:.4f}")


def main():
    out = []
    p = out.append
    p(f"sensing-bak2wide: the sensing-bak2 experiment with the camera moved in and the focal length shortened (f = 200 x distance). {SEEDS} seeds per cell, 300 features. Synthetic only.")
    p("Object stays the same pixel size; true k1 = -0.2, k2 = +0.1 unless stated; 0.5 px noise, 12 views, every pose wrong.")
    p("Mean surface error in object radii. fixed = focal held, no distortion; none = focal free; k1 = focal and k1; k1k2 = focal, k1, k2 (rendering model).")
    p("")
    p("== A. camera distance (focal = 200 x distance): visible-point radius, then errors")
    p("dist f  r_max  r_p95  points " + HEAD)
    for d in DISTS:
        rmax, r95, n = rig_radius_stats(d, seeds=SEEDS)
        c = cell(dist=d, k1_true=-0.2, k2_true=0.1)
        p(f"{d} {200 * d:.0f} {rmax:.3f} {r95:.3f} {n} " + row("", c).strip())
    p("")
    p("== B. true k2 swept at dist 2.0 (f = 400), k1 = -0.2")
    p("k2  " + HEAD)
    for k2 in [-0.2, 0.0, 0.1, 0.2, 0.4]:
        p(row(f"{k2:+.1f}", cell(dist=2.0, k1_true=-0.2, k2_true=k2)))
    p("")
    p("== C. pixel noise at dist 2.0, k1 = -0.2, k2 = +0.1")
    p("sigma  " + HEAD)
    for s in [0.1, 0.5, 1.0, 2.0]:
        p(row(f"{s}", cell(dist=2.0, sigma_px=s, k1_true=-0.2, k2_true=0.1)))
    text = "\n".join(out) + "\n"
    (HERE / "results.txt").write_text(text)
    print(text, end="")


if __name__ == "__main__":
    main()
