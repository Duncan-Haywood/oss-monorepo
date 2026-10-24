"""Keypoint localisation error of SIFT under known homographies, image noise and blur."""
import numpy as np
import cv2


def random_homography(rng, shape, rot_deg=10.0, scale=(0.9, 1.1), persp=2e-5):
    """Rotation about the image centre, isotropic scale, a small shift and mild perspective."""
    h, w = shape[:2]
    a = np.deg2rad(rng.uniform(-rot_deg, rot_deg))
    s = rng.uniform(*scale)
    c = np.array([w / 2, h / 2])
    R = s * np.array([[np.cos(a), -np.sin(a)], [np.sin(a), np.cos(a)]])
    t = c - R @ c + rng.uniform(-0.03, 0.03, 2) * [w, h]
    H = np.eye(3)
    H[:2, :2] = R
    H[:2, 2] = t
    H[2, :2] = rng.uniform(-persp, persp, 2)
    return H


def apply_h(H, pts):
    p = np.c_[pts, np.ones(len(pts))] @ H.T
    return p[:, :2] / p[:, 2:3]


def degrade(img, noise_sigma=0.0, blur_sigma=0.0, rng=None):
    """Gaussian blur (px) then additive Gaussian noise (grey levels of 255), clipped to uint8."""
    out = img.astype(np.float32)
    if blur_sigma > 0:
        out = cv2.GaussianBlur(out, (0, 0), blur_sigma)
    if noise_sigma > 0:
        out = out + rng.normal(0, noise_sigma, out.shape).astype(np.float32)
    return np.clip(np.rint(out), 0, 255).astype(np.uint8)


def sift_matches(img1, img2, nfeatures=2000):
    """(kp1 xy, kp2 xy, kp1 size, ratio, mutual) for every kp in img1 (brute-force L2, Lowe ratio)."""
    sift = cv2.SIFT_create(nfeatures=nfeatures)
    k1, d1 = sift.detectAndCompute(img1, None)
    k2, d2 = sift.detectAndCompute(img2, None)
    if d1 is None or d2 is None or len(k1) < 2 or len(k2) < 2:
        z = np.zeros((0, 2))
        return z, z, np.zeros(0), np.zeros(0), np.zeros(0, bool)
    bf = cv2.BFMatcher(cv2.NORM_L2)
    m12 = bf.knnMatch(d1, d2, k=2)
    m21 = bf.knnMatch(d2, d1, k=1)
    back = np.array([m[0].trainIdx for m in m21])
    keep = [i for i, m in enumerate(m12) if len(m) == 2]
    p1 = np.array([k1[i].pt for i in keep])
    p2 = np.array([k2[m12[i][0].trainIdx].pt for i in keep])
    size = np.array([k1[i].size for i in keep])
    ratio = np.array([m12[i][0].distance / max(m12[i][1].distance, 1e-9) for i in keep])
    mutual = np.array([back[m12[i][0].trainIdx] == i for i in keep])
    return p1, p2, size, ratio, mutual


def localisation_errors(img_a, img_b, H, ratio_max=0.8, inlier_px=3.0, margin=20):
    """Error vectors (px) of correct-looking matches of img_a to img_b = warp(img_a, H).

    Keeps matches that pass the ratio test and are mutual, whose truth lies `margin` px inside
    img_b, then splits them by `inlier_px`: returns (err of inliers, keypoint sizes of inliers,
    number kept before the split). Inliers are truncated at `inlier_px`, so the spread is a lower bound.
    """
    p1, p2, size, ratio, mutual = sift_matches(img_a, img_b)
    if len(p1) == 0:
        return np.zeros((0, 2)), np.zeros(0), 0
    truth = apply_h(H, p1)
    h, w = img_b.shape[:2]
    inside = (truth[:, 0] > margin) & (truth[:, 0] < w - margin) & (truth[:, 1] > margin) & (truth[:, 1] < h - margin)
    sel = inside & mutual & (ratio <= ratio_max)
    err = p2[sel] - truth[sel]
    d = np.hypot(err[:, 0], err[:, 1])
    ok = d <= inlier_px
    return err[ok], size[sel][ok], int(sel.sum())


def summarise(err):
    """RMS, median and 90th percentile of the error magnitude, and per-axis RMS."""
    d = np.hypot(err[:, 0], err[:, 1])
    return dict(n=len(d), rms=float(np.sqrt((d ** 2).mean())), median=float(np.median(d)),
                p90=float(np.percentile(d, 90)), rms_axis=float(np.sqrt((err ** 2).mean())))
