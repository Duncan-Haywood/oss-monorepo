"""Bundle adjustment under the mismatch mixes measured by `sensing-matchreal` for SIFT.

`sensing-epigate` injected one kind of mismatch at a time (uniform / near / along the epipolar line).
A real matcher produces a mix whose rate and shares depend on the ratio test. `MIXES` holds the
figures measured in `../sensing-matchreal/experiments/results.txt` (no mutual check); `mix_mismatch`
corrupts observations by that mix and `run_trial` scores the same methods as `sensing-epigate`,
plus the gate followed by a RANSAC start.
"""
import sys
from pathlib import Path
import numpy as np

_SIB = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(_SIB / "sensing-epigate" / "src"))
sys.path.insert(0, str(_SIB / "sensing-baoutlier" / "src"))
from sensing_epigate.gate import mismatch, epipolar_gate  # noqa: E402
from sensing_baoutlier.outlier import (robust_adjust, ransac_triangulate, perturb_cameras,  # noqa: E402
                                       _score, make_object, orbit_cameras, project, visible,
                                       triangulate_all)

# name -> (mismatch rate, share along, share near, share far). Source: sensing-matchreal results.txt,
# table A2 (Middlebury Motorcycle stereo pair, SIFT, no mutual check) and the pooled table B
# (ten photographs under known homographies, no mutual check; its "along" share is a 2 px band, not
# an epipolar line, so it is folded into "near" there).
MIXES = {
    "stereo none": (0.563, 0.064, 0.098, 0.838),
    "stereo 0.9": (0.233, 0.187, 0.211, 0.602),
    "stereo 0.8": (0.102, 0.386, 0.287, 0.327),
    "stereo 0.7": (0.061, 0.623, 0.264, 0.113),
    "stereo 0.6": (0.047, 0.743, 0.229, 0.029),
    "homog none": (0.396, 0.0, 0.089, 0.911),
    "homog 0.8": (0.051, 0.0, 0.160, 0.840),
    "homog 0.6": (0.021, 0.0, 0.135, 0.865),
}


def mix_mismatch(shares, clean, vis, frac, rng, cams, pts, near_px=40.0):
    """Corrupt `frac` of the visible observations; each wrong one is along / near / far (uniform)
    with probabilities `shares`. Returns (uvs, mask)."""
    p = np.asarray(shares, float)
    p = p / p.sum()
    mask = (rng.random(vis.shape) < frac) & vis
    cls = rng.choice(3, size=vis.shape, p=p)
    out = clean.copy()
    for k, kind in enumerate(["along", "near", "uniform"]):
        alt, _ = mismatch(kind, clean, vis, 1.0, rng, cams, pts, near_px)
        sel = mask & (cls == k)
        out[sel] = alt[sel]
    return out, mask


def run_trial(mix="stereo 0.7", n_views=12, sigma_px=0.5, rot_deg=0.5, trans=0.02, seed=0,
              n_feat=300, max_nfev=300, thresh_px=2.0, vote=0.5, rate=None):
    """Surface error (object radii, after similarity alignment) with wrong poses and a measured mix.

    Methods: `cauchy` (all-view start), `ri_cauchy` (RANSAC start), `g_cauchy` (epipolar gate, then
    all-view start), `g_ri` (gate, then RANSAC start on the kept observations), `clean_ba` (floor).
    `recall`/`lost`: share of mismatches / good observations the gate removed."""
    r, *sh = MIXES[mix]
    r = r if rate is None else rate
    rng = np.random.default_rng(4000 + seed)
    pts, nrm = make_object(n_feat, seed=seed)
    true_cams = orbit_cameras(n_views, 360.0)
    vis = np.array([visible(c, pts, nrm) for c in true_cams])
    clean = np.array([project(c, pts) + rng.normal(0, sigma_px, (len(pts), 2)) for c in true_cams])
    noisy = perturb_cameras(true_cams, rot_deg, trans, rng)
    uvs, mask = mix_mismatch(sh, clean, vis, r, rng, true_cams, pts)
    rec0, idx0 = triangulate_all(noisy, clean, vis)
    keep = epipolar_gate(uvs, vis, thresh_px, vote=vote, seed=seed)
    rec_g, idx_g = triangulate_all(noisy, uvs, keep, min_angle_deg=0.0)
    rec_a, idx_a = triangulate_all(noisy, uvs, vis, min_angle_deg=0.0)
    idx = np.intersect1d(idx0, idx_g)
    gt = pts[idx]
    f = 3 * sigma_px
    out = {"n_pts": len(idx), "cover": len(idx) / len(idx0),
           "recall": float((~keep & mask).sum() / max(mask.sum(), 1)),
           "lost": float((~keep & vis & ~mask).sum() / max((vis & ~mask).sum(), 1))}
    _, p = robust_adjust(noisy, clean, vis, rec0[np.searchsorted(idx0, idx)], idx)
    out["clean_ba"] = _score(p, gt, True)
    ra = rec_a[np.searchsorted(idx_a, idx)]
    _, p = robust_adjust(noisy, uvs, vis, ra, idx, "cauchy", f, max_nfev=max_nfev)
    out["cauchy"] = _score(p, gt, True)
    rr = ransac_triangulate(noisy, uvs, vis, idx)
    _, p = robust_adjust(noisy, uvs, vis, rr, idx, "cauchy", f, max_nfev=max_nfev)
    out["ri_cauchy"] = _score(p, gt, True)
    rg = rec_g[np.searchsorted(idx_g, idx)]
    _, p = robust_adjust(noisy, uvs, keep, rg, idx, "cauchy", f, max_nfev=max_nfev)
    out["g_cauchy"] = _score(p, gt, True)
    rgr = ransac_triangulate(noisy, uvs, keep, idx)
    _, p = robust_adjust(noisy, uvs, keep, rgr, idx, "cauchy", f, max_nfev=max_nfev)
    out["g_ri"] = _score(p, gt, True)
    return out
