"""Subset study of Zhang calibration on the OpenCV sample checkerboard images."""
import glob
import os

import cv2
import numpy as np

BOARD = (9, 6)  # inner corners (columns, rows)
IMG_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data")

# "full": OpenCV default, 5 distortion terms, free principal point.
# "lean": k1 only, zero tangential, principal point fixed at the image centre.
FLAGS = {
    "full": 0,
    "lean": (cv2.CALIB_FIX_PRINCIPAL_POINT | cv2.CALIB_ZERO_TANGENT_DIST
             | cv2.CALIB_FIX_K2 | cv2.CALIB_FIX_K3),
}


def object_points():
    g = np.zeros((BOARD[0] * BOARD[1], 3), np.float32)
    g[:, :2] = np.mgrid[0:BOARD[0], 0:BOARD[1]].T.reshape(-1, 2)  # unit = one square
    return g


def find_corners(img_dir=IMG_DIR):
    """Return (names, list of Nx1x2 float32 corner arrays, image size (w, h))."""
    names, pts, size = [], [], None
    crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.001)
    for p in sorted(glob.glob(os.path.join(img_dir, "left*.jpg"))):
        im = cv2.imread(p, cv2.IMREAD_GRAYSCALE)
        size = (im.shape[1], im.shape[0])
        ok, c = cv2.findChessboardCorners(im, BOARD)
        if not ok:
            continue
        c = cv2.cornerSubPix(im, c, (11, 11), (-1, -1), crit)
        names.append(os.path.basename(p))
        pts.append(c.reshape(-1, 1, 2).astype(np.float32))
    return names, pts, size


def calibrate(corners, size, model="full"):
    """Return dict with fx, fy, cx, cy, dist, rms, rvecs, tvecs, K."""
    obj = [object_points()] * len(corners)
    K0 = np.array([[size[0], 0, size[0] / 2], [0, size[0], size[1] / 2], [0, 0, 1.0]])
    flags = FLAGS[model] | cv2.CALIB_USE_INTRINSIC_GUESS
    if model == "lean":
        flags |= cv2.CALIB_FIX_ASPECT_RATIO
    rms, K, dist, rv, tv = cv2.calibrateCamera(obj, corners, size, K0, None, flags=flags)
    return dict(fx=K[0, 0], fy=K[1, 1], cx=K[0, 2], cy=K[1, 2], dist=dist.ravel(),
                rms=rms, rvecs=rv, tvecs=tv, K=K)


def heldout_error(cal, corners):
    """RMS reprojection error (px) of views not used in the fit: pose by solvePnP."""
    obj = object_points()
    se, n = 0.0, 0
    for c in corners:
        ok, rv, tv = cv2.solvePnP(obj, c, cal["K"], cal["dist"])
        proj, _ = cv2.projectPoints(obj, rv, tv, cal["K"], cal["dist"])
        d = proj.reshape(-1, 2) - c.reshape(-1, 2)
        se += float((d ** 2).sum())
        n += len(d)
    return float(np.sqrt(se / n))


def subset_study(corners, size, model, ks, n_draw, seed=0):
    """For each subset size k draw up to n_draw random subsets; report the focal spread.

    Returns {k: dict(fx=array, heldout=array)}.
    """
    rng = np.random.default_rng(seed)
    n = len(corners)
    out = {}
    for k in ks:
        fx, ho = [], []
        for _ in range(n_draw):
            idx = rng.choice(n, k, replace=False)
            rest = [i for i in range(n) if i not in set(idx.tolist())]
            try:
                cal = calibrate([corners[i] for i in idx], size, model)
            except cv2.error:
                continue
            fx.append(cal["fx"])
            if rest:
                ho.append(heldout_error(cal, [corners[i] for i in rest]))
        out[k] = dict(fx=np.array(fx), heldout=np.array(ho))
    return out


def synthetic_study(full, size, model, ks, n_draw, sigma, seed=0):
    """Same subset study on images re-rendered from the full fit's board poses with
    Gaussian pixel noise ``sigma`` and the full fit's intrinsics as ground truth."""
    rng = np.random.default_rng(seed)
    obj = object_points()
    clean = []
    for rv, tv in zip(full["rvecs"], full["tvecs"]):
        p, _ = cv2.projectPoints(obj, rv, tv, full["K"], full["dist"])
        clean.append(p.astype(np.float64))
    truth = full["fx"]
    out = {}
    for k in ks:
        err = []
        for _ in range(n_draw):
            idx = rng.choice(len(clean), k, replace=False)
            noisy = [(clean[i] + rng.normal(0, sigma, clean[i].shape)).astype(np.float32) for i in idx]
            try:
                cal = calibrate(noisy, size, model)
            except cv2.error:
                continue
            err.append(cal["fx"] / truth - 1)
        out[k] = np.array(err)
    return out
