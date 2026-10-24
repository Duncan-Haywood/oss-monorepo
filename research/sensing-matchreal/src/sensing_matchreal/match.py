"""SIFT matching with a ratio-test sweep, scored against ground-truth correspondences."""
import numpy as np
import cv2


def sift_matches(img1, img2, nfeatures=3000, seed_ratio_only=True):
    """Return (kp1 xy, kp2 xy of best match, ratio d1/d2, mutual flag) for every kp in img1.

    Brute-force L2 on SIFT descriptors; `ratio` is best/second-best distance (Lowe 2004), `mutual`
    is True where the best match of img2's keypoint points back.
    """
    sift = cv2.SIFT_create(nfeatures=nfeatures)
    k1, d1 = sift.detectAndCompute(img1, None)
    k2, d2 = sift.detectAndCompute(img2, None)
    bf = cv2.BFMatcher(cv2.NORM_L2)
    m12 = bf.knnMatch(d1, d2, k=2)
    m21 = bf.knnMatch(d2, d1, k=1)
    back = np.array([m[0].trainIdx for m in m21])
    p1, p2, ratio, mutual = [], [], [], []
    for i, (a, b) in enumerate(m12):
        p1.append(k1[i].pt)
        p2.append(k2[a.trainIdx].pt)
        ratio.append(a.distance / max(b.distance, 1e-9))
        mutual.append(back[a.trainIdx] == i)
    return np.array(p1), np.array(p2), np.array(ratio), np.array(mutual)


def match_errors(p1, p2, expected):
    """Error vector (px) of each match against the ground-truth position `expected` (NaN = no truth)."""
    return p2 - expected


def classify(err, correct_px=3.0, near_px=40.0, band_px=2.0, epipolar_dir=(1.0, 0.0)):
    """Label each error vector: 'ok', 'along', 'near' or 'far'; NaN rows are 'nan'.

    ok: within correct_px of the truth. along: farther than that but within band_px of the true
    epipolar line (direction `epipolar_dir`), so a single-pair epipolar test passes it. near: within
    near_px of the truth. far: anything else. `along` is checked before `near`.
    """
    err = np.asarray(err, float)
    out = np.full(len(err), "nan", dtype=object)
    good = np.isfinite(err).all(axis=1)
    d = np.hypot(err[:, 0], err[:, 1])
    u = np.asarray(epipolar_dir, float)
    u = u / np.hypot(*u)
    with np.errstate(invalid="ignore"):
        perp = np.abs(err[:, 0] * -u[1] + err[:, 1] * u[0])
        lab = np.where(d <= correct_px, "ok", np.where(perp <= band_px, "along", np.where(d <= near_px, "near", "far")))
    out[good] = lab[good]
    return out
