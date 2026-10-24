"""Measure SIFT keypoint localisation error against noise, blur and keypoint scale.

    python experiments/run.py > experiments/results.txt
"""
import sys
from pathlib import Path

import cv2
import numpy as np
from skimage import data

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from sensing_kploc.kploc import apply_h, degrade, localisation_errors, random_homography, summarise  # noqa: E402

NAMES = ["astronaut", "camera", "coffee", "chelsea", "brick", "gravel", "grass", "text", "page", "moon"]
WARPS = 3
NOISE = [0, 2, 5, 10, 20, 40]
BLUR = [0, 1, 2, 3]


def gray(name):
    im = getattr(data, name)()
    if im.ndim == 3:
        im = cv2.cvtColor(im, cv2.COLOR_RGB2GRAY)
    return im


def pairs(integer_shift=False):
    rng = np.random.default_rng(0)
    for name in NAMES:
        a = gray(name)
        for _ in range(WARPS):
            if integer_shift:
                H = np.eye(3)
                H[:2, 2] = rng.integers(3, 12, 2)
            else:
                H = random_homography(rng, a.shape)
            b = cv2.warpPerspective(a, H, (a.shape[1], a.shape[0]), flags=cv2.INTER_LINEAR)
            yield name, a, b, H


def run(noise=0.0, blur=0.0, integer_shift=False, seed=1):
    rng = np.random.default_rng(seed)
    errs, sizes, kept = [], [], 0
    for _, a, b, H in pairs(integer_shift):
        e, s, k = localisation_errors(degrade(a, noise, blur, rng), degrade(b, noise, blur, rng), H)
        errs.append(e)
        sizes.append(s)
        kept += k
    return np.vstack(errs), np.concatenate(sizes), kept


def row(label, err, kept):
    s = summarise(err)
    print(f"| {label} | {s['n']} | {s['n'] / max(kept, 1):.3f} | {s['rms']:.3f} | {s['median']:.3f} | {s['p90']:.3f} |")


HEAD = "| {} | inliers | inlier share of kept | RMS err (px) | median (px) | 90th pct (px) |\n|---|---|---|---|---|---|"


def main():
    print(f"SIFT (OpenCV {cv2.__version__}), {len(NAMES)} scikit-image images x {WARPS} warps; ratio <= 0.8, mutual, inliers within 3 px of truth\n")
    print("== A. control: integer translation (no interpolation, no resampling)")
    print(HEAD.format("condition"))
    e, _, k = run(integer_shift=True)
    row("integer shift", e, k)
    print("\n== B. warped (bilinear resampling), noise sigma on both images")
    print(HEAD.format("noise (grey levels)"))
    for n in NOISE:
        e, _, k = run(noise=n)
        row(n, e, k)
    print("\n== C. warped, Gaussian blur sigma (px) on both images")
    print(HEAD.format("blur sigma (px)"))
    for b in BLUR:
        e, _, k = run(blur=b)
        row(b, e, k)
    print("\n== F. per-keypoint localisation sigma implied by section B (RMS per axis / sqrt 2) and the surface error it gives at 0.0028 radii per px (sensing-recon)")
    print("| noise (grey levels) | per-keypoint sigma per axis (px) | surface error (radii) |\n|---|---|---|")
    for n in NOISE:
        e, _, _ = run(noise=n)
        sg = summarise(e)["rms_axis"] / np.sqrt(2)
        print(f"| {n} | {sg:.3f} | {0.0028 * sg:.5f} |")
    print("\n== D. warped, clean, by keypoint size (SIFT diameter, px)")
    print(HEAD.format("size bin"))
    e, s, k = run()
    for lo, hi in [(0, 3), (3, 5), (5, 8), (8, 16), (16, 1e9)]:
        m = (s >= lo) & (s < hi)
        if m.sum() > 1:
            row(f"{lo}-{hi if hi < 1e8 else 'inf'}", e[m], int(m.sum()))
    print("\n== E. warped, noise sigma 10: by keypoint size")
    print(HEAD.format("size bin"))
    e, s, k = run(noise=10)
    for lo, hi in [(0, 3), (3, 5), (5, 8), (8, 16), (16, 1e9)]:
        m = (s >= lo) & (s < hi)
        if m.sum() > 1:
            row(f"{lo}-{hi if hi < 1e8 else 'inf'}", e[m], int(m.sum()))


if __name__ == "__main__":
    main()
