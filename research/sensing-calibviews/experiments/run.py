"""Writes results.txt: focal-length spread against the number of calibration views."""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from calibviews import find_corners, calibrate, subset_study, synthetic_study  # noqa: E402

KS = [3, 4, 5, 6, 8, 10, 12]
N_DRAW = 150


def row(k, fx, ref, ho=None):
    rel = fx / ref - 1
    lo, hi = np.percentile(rel, [5, 95])
    s = f"{k:3d} {len(fx):5d} {100*np.median(rel):+7.2f} {100*lo:+7.2f} {100*hi:+7.2f} {100*np.mean(np.abs(rel) < 0.02):6.0f}"
    if ho is not None:
        s += f" {np.median(ho):8.3f}"
    return s


def main():
    names, corners, size = find_corners()
    out = [f"images with a found 9x6 board: {len(corners)} of 13 ({', '.join(names)})", f"size {size}"]
    for model in ("full", "lean"):
        full = calibrate(corners, size, model)
        out.append(f"\n== model {model}: all {len(corners)} views: fx={full['fx']:.1f} fy={full['fy']:.1f} "
                   f"cx={full['cx']:.1f} cy={full['cy']:.1f} rms={full['rms']:.3f} px dist={np.round(full['dist'],4).tolist()}")
        out.append("A. real images, random subsets; focal error relative to the all-views fit")
        out.append("  k draws median% p5% p95% within2% heldout_px")
        st = subset_study(corners, size, model, KS, N_DRAW, seed=1)
        for k in KS:
            out.append(row(k, st[k]["fx"], full["fx"], st[k]["heldout"]))
        out.append(f"B. synthetic: the all-views poses and intrinsics re-rendered with noise sigma={full['rms']:.3f} px; error vs known truth")
        out.append("  k draws median% p5% p95% within2%")
        sy = synthetic_study(full, size, model, KS, N_DRAW, full["rms"], seed=2)
        for k in KS:
            rel = sy[k]
            lo, hi = np.percentile(rel, [5, 95])
            out.append(f"{k:3d} {len(rel):5d} {100*np.median(rel):+7.2f} {100*lo:+7.2f} {100*hi:+7.2f} {100*np.mean(np.abs(rel)<0.02):6.0f}")
    text = "\n".join(out)
    print(text)
    with open(os.path.join(os.path.dirname(__file__), "results.txt"), "w") as f:
        f.write(text + "\n")


if __name__ == "__main__":
    main()
