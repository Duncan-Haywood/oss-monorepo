"""Sweeps for sensing-matchreal. Writes results.txt (stdout is the same text).

    python experiments/run.py
"""
import sys
from pathlib import Path
import numpy as np
import cv2
from skimage import data, color

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from sensing_matchreal import classify, sift_matches  # noqa: E402

RATIOS = [1.01, 0.9, 0.8, 0.7, 0.6]  # 1.01 = no ratio test
LABELS = ["ok", "along", "near", "far"]


def gray(im):
    return (color.rgb2gray(im) * 255).astype(np.uint8) if im.ndim == 3 else im.astype(np.uint8)


def stereo_case():
    l, r, d = data.stereo_motorcycle()
    g1, g2 = gray(l), gray(r)
    p1, p2, ratio, mutual = sift_matches(g1, g2)
    xi = np.clip(np.round(p1).astype(int), 0, [g1.shape[1] - 1, g1.shape[0] - 1])
    disp = d[xi[:, 1], xi[:, 0]]
    disp = np.where(np.isfinite(disp), disp, np.nan)
    exp = np.stack([p1[:, 0] - disp, p1[:, 1]], 1)
    return p1, p2 - exp, ratio, mutual


def homography_case(name, seed):
    im = gray(getattr(data, name)())
    h, w = im.shape
    rng = np.random.default_rng(seed)
    ang = np.deg2rad(rng.uniform(-15, 15))
    s = rng.uniform(0.85, 1.15)
    A = np.array([[s * np.cos(ang), -s * np.sin(ang), 0], [s * np.sin(ang), s * np.cos(ang), 0], [0, 0, 1.0]])
    A[:2, 2] = np.array([w / 2, h / 2]) - A[:2, :2] @ np.array([w / 2, h / 2]) + rng.uniform(-10, 10, 2)
    A[2, :2] = rng.uniform(-3e-4, 3e-4, 2)
    im2 = cv2.warpPerspective(im, A, (w, h))
    p1, p2, ratio, mutual = sift_matches(im, im2)
    q = (A @ np.c_[p1, np.ones(len(p1))].T).T
    exp = q[:, :2] / q[:, 2:3]
    inside = (exp[:, 0] >= 0) & (exp[:, 0] < w) & (exp[:, 1] >= 0) & (exp[:, 1] < h)
    err = p2 - exp
    err[~inside] = np.nan
    return p1, err, ratio, mutual


def table(err, ratio, mutual, epi):
    rows = []
    for rt in RATIOS:
        for mu in (False, True):
            keep = (ratio < rt) & (mutual if mu else True)
            lab = classify(err[keep], epipolar_dir=epi)
            n = int((lab != "nan").sum())
            if n == 0:
                continue
            c = {k: int((lab == k).sum()) for k in LABELS}
            bad = n - c["ok"]
            rows.append((rt, mu, n, c, bad))
    return rows


def fmt(rows):
    out = ["ratio mutual kept mismatch_rate | share of mismatches: along near far"]
    for rt, mu, n, c, bad in rows:
        sh = " ".join(f"{(c[k] / bad if bad else float('nan')):.3f}" for k in ["along", "near", "far"])
        out.append(f"{'none' if rt > 1 else rt:>4} {str(mu):>5} {n:5d} {bad / n:.3f} | {sh}")
    return out


def main():
    out = []
    p = out.append
    p(f"sensing-matchreal: SIFT (OpenCV {cv2.__version__}, 3000 features) against ground truth. ok = within 3 px; along = off by more but within 2 px of the true epipolar line; near = within 40 px; far = beyond.")
    p("")
    p("== A. Middlebury 2014 'Motorcycle' rectified stereo pair (741x500), left to right, truth from the disparity map")
    p1, err, ratio, mutual = stereo_case()
    rows = table(err, ratio, mutual, (1.0, 0.0))
    out += fmt(rows)
    lab = classify(err, epipolar_dir=(1.0, 0.0))
    p("")
    p("== A2. stereo, no mutual check: ratio-test threshold (1.0 = none), mismatch rate, then shares along / near / far")
    p("thresh mismatch along near far")
    for rt, mu, n, c, bad in rows:
        if not mu:
            p(f"{1.0 if rt > 1 else rt} {bad / n:.3f} " + " ".join(f"{c[k] / bad:.3f}" for k in ['along', 'near', 'far']))
    p("")
    p("median |error| of mismatches without ratio test (px): " + " ".join(f"{k}={np.median(np.hypot(*err[lab == k].T)):.1f}" for k in ["along", "near", "far"] if (lab == k).any()))
    # control: pair every left keypoint with a random right keypoint; how often does chance land in the band?
    g1, g2 = (gray(x) for x in data.stereo_motorcycle()[:2])
    k2 = np.array([k.pt for k in cv2.SIFT_create(nfeatures=3000).detectAndCompute(g2, None)[0]])
    rng = np.random.default_rng(0)
    xi = np.clip(np.round(p1).astype(int), 0, [g1.shape[1] - 1, g1.shape[0] - 1])
    disp = data.stereo_motorcycle()[2][xi[:, 1], xi[:, 0]]
    exp = np.stack([p1[:, 0] - disp, p1[:, 1]], 1)
    rl = classify(k2[rng.integers(0, len(k2), len(p1))] - exp)
    nb = int(((rl != "ok") & (rl != "nan")).sum())
    p(f"control (random right keypoint instead of the match): along-share of the wrong ones = {(rl == 'along').sum() / nb:.3f}, near {(rl == 'near').sum() / nb:.3f}")
    p("")
    p("== B. Known-homography pairs (rotation +-15 deg, scale 0.85-1.15, perspective), per-image rows use one seed (own seed per image); the pooled table adds two more seeds per image")
    names = ["astronaut", "camera", "coffee", "chelsea", "brick", "gravel", "grass", "text", "page", "moon"]
    pooled = []
    for i, nm in enumerate(names):
        for extra in (1, 2):
            e2, r2, m2 = homography_case(nm, i + 10 * extra)[1:]
            pooled.append((e2, r2, m2))
        p1, err, ratio, mutual = homography_case(nm, i)
        lab = classify(err[ratio < 1.01])
        n = int((lab != "nan").sum())
        bad = n - int((lab == "ok").sum())
        lab8 = classify(err[ratio < 0.8])
        n8 = int((lab8 != "nan").sum())
        bad8 = n8 - int((lab8 == "ok").sum())
        sh = (lambda l, b, k: (l == k).sum() / b if b else float("nan"))
        p(f"{nm:10s} none: n={n:4d} mismatch={bad / max(n, 1):.3f} near-share={sh(lab, bad, 'near'):.3f} far-share={sh(lab, bad, 'far'):.3f} | ratio<0.8: n={n8:4d} mismatch={bad8 / max(n8, 1):.3f}")
        pooled.append((err, ratio, mutual))
    E = np.vstack([e for e, _, _ in pooled]); R = np.concatenate([r for _, r, _ in pooled]); M = np.concatenate([m for _, _, m in pooled])
    p("")
    p("pooled over the ten images, three warps each (a homography pair has no single epipolar line, so the 'along' class is only a")
    p("2 px horizontal band here and is not meaningful; read near and far):")
    out += fmt(table(E, R, M, (1.0, 0.0)))
    text = "\n".join(out)
    print(text)
    (HERE / "results.txt").write_text(text + "\n")


if __name__ == "__main__":
    main()
