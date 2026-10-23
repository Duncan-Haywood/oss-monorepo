"""Sweeps for sensing-bapp. Writes results.txt (stdout is the same text).

    PYTHONPATH=src python experiments/run.py
"""
import sys
from pathlib import Path
import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from sensing_bapp import run_trial_pp  # noqa: E402

SEEDS = 6
HEAD = "tri  pp_held  pp_free  dx_est  dy_est  dx_sd  k2_held  k2_free  f_err_held  f_err_free"


def cell(offset=0.0, **kw):
    # offset along (1, -0.8) px so both axes are exercised; dx = offset, dy = -0.8 offset
    rs = [run_trial_pp(seed=s, dx=offset, dy=-0.8 * offset, **kw) for s in range(SEEDS)]
    m = lambda k: float(np.mean([r[k] for r in rs]))
    return (f"{m('tri'):.4f} {m('pp_held'):.4f} {m('pp_free'):.4f} {m('dx_est'):+.1f} {m('dy_est'):+.1f} "
            f"{np.std([r['dx_est'] for r in rs]):.1f} {m('k2_held'):+.3f} {m('k2_est'):+.3f} "
            f"{m('f_err_held'):.4f} {m('f_err'):.4f}")


def main():
    out = []
    p = out.append
    p(f"sensing-bapp: self-calibrating bundle adjustment with a true principal-point offset (dx, dy = offset, -0.8 offset px). {SEEDS} seeds per cell, 300 features. Synthetic only.")
    p("Rendering: k1 = -0.2, k2 = +0.1, 0.5 px noise, 12 views, every pose wrong; rig of sensing-bak2wide (f = 200 x distance).")
    p("pp_held = focal, k1, k2 free with the principal point held at the image centre; pp_free = also fits it. Surface error in object radii; dx_est in px.")
    p("")
    for d in (2.0, 4.0):
        p(f"== A. offset swept, camera distance {d} (f = {200 * d:.0f})")
        p("offset " + HEAD)
        for o in [0, 2, 5, 10, 20]:
            p(f"{o} " + cell(o, dist=d))
        p("")
    p("== B. camera distance swept at offset 10 px")
    p("dist " + HEAD)
    for d in [4.0, 3.0, 2.5, 2.0]:
        p(f"{d} " + cell(10, dist=d))
    p("")
    p("== C. pixel noise at distance 2.0, offset 10 px")
    p("sigma " + HEAD)
    for s in [0.1, 0.5, 1.0, 2.0]:
        p(f"{s} " + cell(10, dist=2.0, sigma_px=s))
    text = "\n".join(out) + "\n"
    (HERE / "results.txt").write_text(text)
    print(text, end="")


if __name__ == "__main__":
    main()
