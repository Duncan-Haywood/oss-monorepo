"""Sweeps for sensing-batan. Writes results.txt (stdout is the same text).

    PYTHONPATH=src python experiments/run.py
"""
import sys
from pathlib import Path
import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from sensing_batan import run_trial_tan  # noqa: E402

SEEDS = 8
HEAD = "tri  held  free  p1_est  p2_est  p1_sd  k2_held  k2_free  f_err_held  f_err_free"


def cell(p=0.0, **kw):
    # p1 = p, p2 = -0.8 p so both coefficients are exercised
    rs = [run_trial_tan(seed=s, p1_true=p, p2_true=-0.8 * p, **kw) for s in range(SEEDS)]
    m = lambda k: float(np.mean([r[k] for r in rs]))
    return (f"{m('tri'):.4f} {m('tan_held'):.4f} {m('tan_free'):.4f} {m('p1_est'):+.4f} {m('p2_est'):+.4f} "
            f"{np.std([r['p1_est'] for r in rs]):.4f} {m('k2_held'):+.3f} {m('k2_est'):+.3f} "
            f"{m('f_err_held'):.4f} {m('f_err'):.4f}")


def main():
    out = []
    p = out.append
    p(f"sensing-batan: self-calibrating bundle adjustment with true tangential distortion (p1, p2 = p, -0.8 p). {SEEDS} seeds per cell, 300 features. Synthetic only.")
    p("Rendering: k1 = -0.2, k2 = +0.1, 0.5 px noise, 12 views, every pose wrong, principal point at the centre; rig of sensing-bak2wide (f = 200 x distance).")
    p("held = focal, k1, k2 free with p1 = p2 = 0; free = also fits p1, p2. Surface error in object radii.")
    p("")
    for d in (2.0, 4.0):
        p(f"== A. p swept, camera distance {d} (f = {200 * d:.0f})")
        p("p " + HEAD)
        for q in [0, 0.001, 0.002, 0.005, 0.01, 0.02]:
            p(f"{q} " + cell(q, dist=d))
        p("")
    p("== B. camera distance swept at p = 0.01")
    p("dist " + HEAD)
    for d in [4.0, 3.0, 2.5, 2.0]:
        p(f"{d} " + cell(0.01, dist=d))
    p("")
    p("== C. pixel noise at distance 2.0, p = 0.01")
    p("sigma " + HEAD)
    for s in [0.1, 0.5, 1.0, 2.0]:
        p(f"{s} " + cell(0.01, dist=2.0, sigma_px=s))
    text = "\n".join(out) + "\n"
    (HERE / "results.txt").write_text(text)
    print(text, end="")


if __name__ == "__main__":
    main()
