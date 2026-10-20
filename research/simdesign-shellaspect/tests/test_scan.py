import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from simdesign_shellaspect import eigbuckle as eb


def test_ratio_falls_toward_one_as_bar_gets_longer():
    """FE / closed form is closer to 1 for l/w = 6 than for l/w = 3 at the same element size."""
    r = []
    for l in (24.0, 48.0):
        fe = eb.critical_loads(l, 8.0, 2.0, "shear", int(l // 2), 4, 2, k=1)[0]
        r.append(fe / eb.closed_forms(l, 8.0, 2.0, "shear"))
    assert r[1] < r[0]
    assert r[1] > 0.9


def test_closed_form_scales_as_inverse_square_length():
    a = eb.closed_forms(24.0, 8.0, 2.0, "shear")
    b = eb.closed_forms(48.0, 8.0, 2.0, "shear")
    assert abs(a / b - 4.0) < 1e-9
