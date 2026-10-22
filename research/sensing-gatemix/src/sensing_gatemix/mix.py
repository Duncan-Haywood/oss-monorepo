"""Feed the mismatch mixes measured by `sensing-matchreal` into the `sensing-epigate` trial.

The measured mix is (mismatch rate, share along the epipolar line / near / far) per ratio-test
threshold. Each corrupted observation draws its kind from those shares: `along` and `near` use
`sensing-epigate`'s shifts (10 to 40 px), `far` is a uniformly random pixel. The rate and shares are
parsed from `sensing-matchreal`'s committed results.txt, never retyped.
"""
import sys
from contextlib import contextmanager
from pathlib import Path
import numpy as np

_R = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(_R / "sensing-epigate" / "src"))
sys.path.insert(0, str(_R / "sensing-baoutlier" / "src"))
from sensing_epigate import gate  # noqa: E402

_BASE = gate.mismatch  # the unpatched epigate function
MATCHREAL = _R / "sensing-matchreal" / "experiments" / "results.txt"
_KIND = {"along": "along", "near": "near", "far": "uniform"}


def measured_mixes(path=MATCHREAL):
    """Parse sensing-matchreal results.txt. Returns {(pair, ratio, mutual): (rate, {along, near, far})}.

    pair 'A' is the real stereo pair (section A: ratio 'none' or 0.9..0.6, mutual False/True);
    pair 'B' is the pooled warped-photograph table. ratio 'none' is returned as 1.0."""
    out, pair = {}, None
    for line in Path(path).read_text().splitlines():
        if line.startswith("== "):
            pair = "A" if line.startswith("== A. ") else None
        elif line.startswith("pooled over"):
            pair = "B"
        if pair is None or "|" not in line or line.startswith("ratio"):
            continue
        left, right = line.split("|")
        p = left.split()
        if len(p) != 4 or p[1] not in ("True", "False"):
            continue
        ratio = 1.0 if p[0] == "none" else float(p[0])
        s = [float(x) for x in right.split()]
        out[(pair, ratio, p[1] == "True")] = (float(p[3]), dict(zip(("along", "near", "far"), s)))
    return out


def mixed_mismatch(shares, clean, vis, frac, rng, cams=None, pts=None, near_px=40.0):
    """Corrupt `frac` of the visible observations, each of a kind drawn from `shares`. Returns (uvs, mask)."""
    names = list(shares)
    p = np.array([shares[k] for k in names], float)
    p = p / p.sum()
    mask = (rng.random(vis.shape) < frac) & vis
    which = rng.choice(len(names), size=vis.shape, p=p)
    out = clean.copy()
    for i, k in enumerate(names):
        sub = mask & (which == i)
        if sub.any():
            o, _ = _BASE(_KIND[k], clean, sub, 1.0, rng, cams, pts, near_px)
            out[sub] = o[sub]
    return out, mask


@contextmanager
def _patched(shares):
    orig = gate.mismatch

    def fake(kind, clean, vis, frac, rng, cams=None, pts=None, near_px=40.0):
        return mixed_mismatch(shares, clean, vis, frac, rng, cams, pts, near_px)

    gate.mismatch = fake
    try:
        yield
    finally:
        gate.mismatch = orig


def run_mixed(shares, frac, **kw):
    """`sensing_epigate.run_trial` with mismatches drawn from `shares` ({'along','near','far'} weights)."""
    with _patched(shares):
        return gate.run_trial(kind="mix", frac=frac, **kw)
