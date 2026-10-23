"""Run sensing-epigate's trial with a mismatch population measured from a real matcher.

MIXES comes from sensing-matchreal/experiments/results.txt, table A (Middlebury Motorcycle, OpenCV SIFT,
no mutual check): ratio threshold -> (mismatch rate, share along, share near, share far).
`far` is drawn as a uniform random pixel (the measured median far error is 250 px), `near` and `along`
as in sensing-epigate (10 to 40 px; the measured medians are 14 to 17 px)."""
import sys
from pathlib import Path
import numpy as np

_R = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(_R / "sensing-epigate" / "src"))
import sensing_epigate.gate as gate  # noqa: E402

MIXES = {  # label: (rate, along, near, far)
    "none": (0.563, 0.064, 0.098, 0.838),
    "0.9": (0.233, 0.187, 0.211, 0.602),
    "0.8": (0.102, 0.386, 0.287, 0.327),
    "0.7": (0.061, 0.623, 0.264, 0.113),
    "0.6": (0.047, 0.743, 0.229, 0.029),
}
_orig = gate.mismatch


def mixed_mismatch(shares, clean, vis, frac, rng, cams=None, pts=None, near_px=40.0):
    """Corrupt `frac` of the visible observations; each corrupted one is along / near / far with `shares`."""
    out = clean.copy()
    mask = (rng.random(vis.shape) < frac) & vis
    kinds = rng.choice(3, size=int(mask.sum()), p=np.asarray(shares) / np.sum(shares))
    for k, (v, i) in zip(kinds, zip(*np.nonzero(mask))):
        one = np.zeros_like(vis)
        one[v, i] = True
        kind = ("along", "near", "uniform")[k]
        # reuse the single-observation corruption of sensing-epigate / sensing-baoutlier
        if kind == "uniform":
            out[v, i] = [rng.uniform(0, gate.W), rng.uniform(0, gate.H)]
        else:
            o, _ = _orig(kind, clean, one, 1.0, rng, cams, pts, near_px)
            out[v, i] = o[v, i]
    return out, mask


def run_mixed(label, seed=0, **kw):
    """One trial at the measured mix `label`; kw go to sensing_epigate.run_trial."""
    rate, a, n, f = MIXES[label]
    if "shares" in kw:  # control: same rate, other (along, near, far) shares
        a, n, f = kw.pop("shares")

    def patched(kind, clean, vis, frac, rng, cams=None, pts=None, near_px=40.0):
        return mixed_mismatch((a, n, f), clean, vis, frac, rng, cams, pts, near_px)
    gate.mismatch = patched
    try:
        return gate.run_trial(kind="mix", frac=kw.pop("frac", rate), seed=seed, **kw)
    finally:
        gate.mismatch = _orig
