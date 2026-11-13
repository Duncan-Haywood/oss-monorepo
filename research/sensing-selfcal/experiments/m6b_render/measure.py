"""Milestone 6b, step 1: measure grey levels, edge blur and noise on the 26 real images
(11x11 cornerSubPix corners). Writes measure.json; run.py reads it.

    python3 experiments/m6b_render/measure.py
"""
import glob, json, os, sys
import numpy as np
import cv2

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "src"))
from selfcal import detect  # noqa: E402
from render import grey_levels, noise_sigma, edge_sigmas  # noqa: E402


def main():
    out = {}
    for cam in ("left", "right"):
        L, N, E, bg = [], [], [], []
        for f in sorted(glob.glob(os.path.join(ROOT, "data", f"{cam}*.jpg"))):
            c, _ = detect(f)
            img = cv2.imread(f, cv2.IMREAD_GRAYSCALE)
            L.append(grey_levels(img, c)); N.append(noise_sigma(img, c)); E.append(edge_sigmas(img, c))
            bg.append(float(np.median(img)))
        E = np.concatenate(E)
        L = np.array(L)
        out[cam] = dict(dark=float(np.median(L[:, 0])), bright=float(np.median(L[:, 1])),
                        noise=float(np.median(N)), noise_per_image=N,
                        edge_sigma_median=float(np.median(E)), edge_sigma_iqr=[float(np.percentile(E, 25)), float(np.percentile(E, 75))],
                        n_edges=int(len(E)), image_median=float(np.median(bg)))
        # The render's 4x4 area sampling already blurs a sharp edge by a box of one pixel
        # (sigma 1/sqrt(12)); the Gaussian added on top makes up the rest.
        out[cam]["render_blur"] = float(np.sqrt(max(out[cam]["edge_sigma_median"] ** 2 - 1 / 12, 0.01)))
        print(cam, {k: v for k, v in out[cam].items() if k != "noise_per_image"})
    json.dump(out, open(os.path.join(HERE, "measure.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
