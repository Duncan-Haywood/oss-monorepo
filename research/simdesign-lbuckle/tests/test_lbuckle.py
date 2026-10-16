import os, sys
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from simdesign_lbuckle import lbracket as lb

KW = dict(nw=2, nh=8, nl=6, nz=1)


def test_mesh_is_an_L_with_the_right_volume():
    w, b = 18.4, 1.5
    m = lb.mesh_l(w, b, **KW)
    # element volumes of a tensor hex mesh: sum via bounding boxes of each cell
    c = m.p[:, m.t]
    vol = np.prod(c.max(axis=1) - c.min(axis=1), axis=0).sum()
    assert abs(vol - (80 * w + (80 - w) * w) * b) < 1e-6
    assert not np.any((c.mean(axis=1)[0] > w) & (c.mean(axis=1)[1] > w))


def test_compression_buckles_below_tension_and_both_positive():
    t = lb.critical_factors(18.4, 1.5, k=1, sign=1, **KW)[0]
    c = lb.critical_factors(18.4, 1.5, k=1, sign=-1, **KW)[0]
    assert 0 < c < t


def test_load_scales_out():
    a = lb.critical_factors(18.4, 1.5, k=1, sign=1, F=1.0, **KW)[0]
    b = lb.critical_factors(18.4, 1.5, k=1, sign=1, F=7.0, **KW)[0]
    assert abs(a / b - 7.0) < 1e-4 * 7.0
