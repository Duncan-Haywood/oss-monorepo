"""Milestone 6b, unscored (written after H33 was refuted): how far does each outer square of the
real board reach beyond the outer ring of corners, as a fraction of the corner spacing? A full
square reaches 1.0. For every ring corner on the four sides, the intensity profile is sampled
outward along the grid line (from the inner neighbour through the ring corner), and the square's
outer edge is the first crossing of the midpoint between dark and bright levels beyond the
corner. Same measurement on matched renders (the full-square board) as a check. Writes outer.json.

    python3 experiments/m6b_render/outer.py
"""
import glob, json, os, sys
import numpy as np
import cv2

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "src"))
sys.path.insert(0, HERE)
from selfcal import detect, PATTERN  # noqa: E402
from render import grey_levels  # noqa: E402

NX, NY = PATTERN


def reach(img, corners):
    """Outer-square reach per side: list of (side, ratio)."""
    G = corners.reshape(NY, NX, 2)
    dark, bright = grey_levels(img, corners)
    mid = (dark + bright) / 2
    im = img.astype(np.float32)
    out = []
    # (ring corner, inner neighbour) pairs on each side; skip the four grid corners' diagonal.
    sides = {"top": [(G[0, c], G[1, c]) for c in range(NX)], "bottom": [(G[-1, c], G[-2, c]) for c in range(NX)],
             "left": [(G[r, 0], G[r, 1]) for r in range(NY)], "right": [(G[r, -1], G[r, -2]) for r in range(NY)]}
    for side, pairs in sides.items():
        for p, q in pairs:
            d = p - q
            sp = np.linalg.norm(d)
            u = d / sp
            # Offset sideways by a quarter spacing, into the middle of one outer square's edge
            # region, on both sides of the grid line; keep the side whose square is dark.
            n = np.array([-u[1], u[0]])
            best = None
            for sgn in (1, -1):
                s = np.linspace(0.1, 1.6, 151) * sp
                pts = (p[None] + s[:, None] * u[None] + sgn * 0.5 * sp * n[None]).astype(np.float32)
                prof = cv2.remap(im, pts[:, 0].reshape(1, -1), pts[:, 1].reshape(1, -1), cv2.INTER_LINEAR).ravel()
                if prof[:20].mean() > mid:          # this side's outer square is bright: skip
                    continue
                above = np.nonzero(prof > mid)[0]
                if len(above) == 0:
                    continue
                k = above[0]
                if k == 0:
                    continue
                # linear interpolation of the crossing
                t = (mid - prof[k - 1]) / (prof[k] - prof[k - 1])
                best = (s[k - 1] + t * (s[k] - s[k - 1])) / sp
            if best is not None:
                out.append((side, float(best)))
    return out


def summarise(rows):
    out = {}
    for side in ("top", "bottom", "left", "right", "all"):
        v = np.array([r for s, r in rows if side in ("all", s)])
        if len(v):
            out[side] = dict(n=int(len(v)), median=float(np.median(v)), p10=float(np.percentile(v, 10)), p90=float(np.percentile(v, 90)))
    return out


def main():
    res = {}
    for cam in ("left", "right"):
        rows = []
        for f in sorted(glob.glob(os.path.join(ROOT, "data", f"{cam}*.jpg"))):
            c, _ = detect(f, method="sb")
            rows += reach(cv2.imread(f, cv2.IMREAD_GRAYSCALE), c)
        res[cam] = summarise(rows)
    # the same measurement on renders of the full-square board (matched setting, seed 0)
    from run import truth_camera, CLEAN  # noqa: E402
    from render import render_clean, degrade  # noqa: E402
    meas = json.load(open(os.path.join(HERE, "measure.json")))
    calib = json.load(open(os.path.join(HERE, "calib.json")))
    for cam in ("left", "right"):
        T = truth_camera(cam)
        M = meas[cam]
        rows = []
        rng = np.random.default_rng(0)
        for v in range(13):
            img = degrade(render_clean(T["intr"], T["rvecs"][v], T["tvecs"][v], T["size"], (M["dark"], M["bright"], M["image_median"])),
                          calib[cam]["blur"], calib[cam]["noise"], rng)
            rows += reach(img, T["proj"][v])
        res[cam + "_render"] = summarise(rows)
    json.dump(res, open(os.path.join(HERE, "outer.json"), "w"), indent=1)
    for k, v in res.items():
        print(k, {s: (d["n"], round(d["median"], 3), round(d["p10"], 3), round(d["p90"], 3)) for s, d in v.items()})


if __name__ == "__main__":
    main()
