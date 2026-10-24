"""A cue that is cheaper for the urgent: what cost advantage lets a signal-reading robot beat yield-all?

Builds on `society-fakeurgency`, where every person paid the same cost `c` to signal urgency and no `c`
let the signal-reading fleet beat yield-all. Here the urgent pay `cU = rho * cN` and the normal pay `cN`
(Spence 1973: a signal separates types when it is cheaper for the type that gains more). `rho = 1` is
`society-fakeurgency`; `rho = 0` is a cue that urgency produces for free (a hurried gait) but that
normal people can only imitate at cost `cN`. The door model and the signalling logit are imported
unchanged from `society-fakeurgency`; only the per-type cost differs.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "society-fakeurgency" / "src"))
sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "society-doorway" / "src"))
from society_fakeurgency import DEF, _sig, door  # noqa: E402,F401


def equilibrium(r, gS, gQ, cU, cN, e=0.0, bs=8.0, iters=600, **kw):
    """Signalling equilibrium with type-specific costs; damped fixed-point iteration from 'nobody signals'."""
    sU = sN = 0.0
    for _ in range(iters):
        D = door(r, gS, gQ, sU, sN, e, **kw)
        nU = _sig(bs * (D["U"]["c0"] - D["U"]["c1"] - cU))
        nN = _sig(bs * (D["N"]["c0"] - D["N"]["c1"] - cN))
        if abs(nU - sU) + abs(nN - sN) < 1e-10:
            break
        sU, sN = 0.5 * sU + 0.5 * nU, 0.5 * sN + 0.5 * nN
    D = door(r, gS, gQ, sU, sN, e, **kw)
    D.update(sU=sU, sN=sN)
    return D


def summary(r, gS, gQ, cU, cN, e=0.0, **kw):
    """Mean cost per encounter by group (signalling cost included) and the share of signals that are urgent."""
    p = {**DEF, **kw}
    u, k, w, d = p["u"], p["k"], p["w"], p["d"]
    D = equilibrium(r, gS, gQ, cU, cN, e, **kw)
    sU, sN = D["sU"], D["sN"]
    cu = sU * (D["U"]["c1"] + cU) + (1 - sU) * D["U"]["c0"]
    cn = sN * (D["N"]["c1"] + cN) + (1 - sN) * D["N"]["c0"]
    gsig, gnos = (1 - e) * gS + e * gQ, e * gS + (1 - e) * gQ

    def vs(g, pp):
        return g * (pp * k) + (1 - g) * (pp * w + (1 - pp) * d)
    tot = sum(D[t]["share"] * (sx * vs(gsig, D[t]["p"]) + (1 - sx) * vs(gnos, D[t]["p"]))
              for t, sx in (("U", sU), ("N", sN)))
    cR = (1 - r) * tot + r * vs(gQ, gQ)
    sig = u * sU + (1 - u) * sN
    return dict(cU=cu, cN=cn, cR=cR, crowd=(1 - r) * (u * cu + (1 - u) * cn) + r * cR, sU=sU, sN=sN,
                precision=(u * sU / sig if sig > 1e-12 else float("nan")))


def yield_all(r, e=0.0, **kw):
    """Baseline: robots always yield, so signalling buys nothing and (any positive cost) nobody signals."""
    return summary(r, 0.0, 0.0, 9.0, 9.0, e, **kw)


def reader(r, cU, cN, e=0.0, **kw):
    return summary(r, 0.0, 1.0, cU, cN, e, **kw)
