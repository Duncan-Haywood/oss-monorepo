"""Pure functions: box matching, recall bins, the recall-curve fit, the leak integral.

Boxes are (x, y, w, h) in pixels. No detector or image is needed here, so tests run alone.
"""
import math
import random

ASSUMED_MID, ASSUMED_K = 20.0, 4.0  # capture-bystander's assumed face detector


def recall_curve(px, mid, k):
    """P(detect) = 1 / (1 + (mid/px)^k): 0.5 at `mid` pixels, steepness k."""
    return 1.0 / (1.0 + (mid / px) ** k)


def iou(a, b):
    ax2, ay2, bx2, by2 = a[0] + a[2], a[1] + a[3], b[0] + b[2], b[1] + b[3]
    iw = max(0.0, min(ax2, bx2) - max(a[0], b[0]))
    ih = max(0.0, min(ay2, by2) - max(a[1], b[1]))
    inter = iw * ih
    union = a[2] * a[3] + b[2] * b[3] - inter
    return inter / union if union > 0 else 0.0


def face_turn(right_eye, left_eye, nose):
    """Face-turn proxy from YuNet landmarks: |nose x - eye-midpoint x| / inter-eye distance (0 = frontal)."""
    ied = math.hypot(left_eye[0] - right_eye[0], left_eye[1] - right_eye[1]) or 1e-9
    return abs(nose[0] - (right_eye[0] + left_eye[0]) / 2) / ied


def face_hit(det, ref):
    """A detection finds a reference face if its centre lies in the face box and its width is within 2x."""
    cx, cy = det[0] + det[2] / 2, det[1] + det[3] / 2
    inside = ref[0] <= cx <= ref[0] + ref[2] and ref[1] <= cy <= ref[1] + ref[3]
    return inside and 0.5 <= det[2] / ref[2] <= 2.0


def wilson(k, n, z=1.96):
    """95% Wilson interval for k hits in n trials."""
    if n == 0:
        return (float("nan"), float("nan"))
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (c - h, c + h)


def bin_trials(trials, edges):
    """trials: (px, hit). Returns [(lo, hi, n, hits, recall, lo95, hi95)] over [edges[i], edges[i+1])."""
    rows = []
    for lo, hi in zip(edges, edges[1:]):
        sel = [h for p, h in trials if lo <= p < hi]
        n, k = len(sel), sum(sel)
        a, b = wilson(k, n)
        rows.append((lo, hi, n, k, k / n if n else float("nan"), a, b))
    return rows


def fit_recall(trials):
    """Maximum-likelihood (mid, k) by grid search over mid 2..400 px and k 0.5..12."""
    import numpy as np

    px = np.array([t[0] for t in trials], float)[:, None, None]
    hit = np.array([t[1] for t in trials], float)[:, None, None]
    mids = (2 * 1.04 ** np.arange(130))[None, :, None]
    ks = (0.5 + 0.25 * np.arange(47))[None, None, :]
    p = np.clip(1.0 / (1.0 + (mids / px) ** ks), 1e-9, 1 - 1e-9)
    nll = -(hit * np.log(p) + (1 - hit) * np.log(1 - p)).sum(0)
    i, j = np.unravel_index(np.argmin(nll), nll.shape)
    return float(mids[0, i, 0]), float(ks[0, 0, j])


def bootstrap_fit(groups, n_boot=100, seed=0):
    """Resample whole subjects (a subject is a list of (px, hit) trials), refit, return mid and k quantiles.

    Trials from one face or person at different scales are correlated, so the subject is the unit.
    """
    rng = random.Random(seed)
    mids, ks = [], []
    for _ in range(n_boot):
        pick = [groups[rng.randrange(len(groups))] for _ in groups]
        m, k = fit_recall([t for g in pick for t in g])
        mids.append(m)
        ks.append(k)
    q = lambda v, f: sorted(v)[min(len(v) - 1, int(f * len(v)))]
    return (q(mids, 0.025), q(mids, 0.975)), (q(ks, 0.025), q(ks, 0.975))


def leak_share(mid, k, f_px_m, ident_px=32.0, d_min=1.0, steps=4000):
    """Share of identifiable faces a face detector misses, per frame, for people spread evenly over
    the ground (count at distance d grows as d). A face of width 0.15 m at d metres spans f_px_m / d px;
    `f_px_m` is face width times source pixels per metre-radian (capture-bystander: 183 for an 8K 360)."""
    d_max = f_px_m / ident_px
    if d_max <= d_min:
        return float("nan")
    num = den = 0.0
    for i in range(steps):
        d = d_min + (d_max - d_min) * (i + 0.5) / steps
        miss = 1.0 - recall_curve(f_px_m / d, mid, k)
        num += d * miss
        den += d
    return num / den


def head_coverage(face, body, q):
    """Share of the face box inside the top `q` of the body box (full width). face and body are (x, y, w, h)."""
    top = (body[0], body[1], body[2], body[3] * q)
    iw = max(0.0, min(face[0] + face[2], top[0] + top[2]) - max(face[0], top[0]))
    ih = max(0.0, min(face[1] + face[3], top[1] + top[3]) - max(face[1], top[1]))
    return iw * ih / (face[2] * face[3])
