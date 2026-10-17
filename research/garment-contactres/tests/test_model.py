import numpy as np
import pytest
from garment_contactres.model import *


def test_intact_lattice_is_independent_of_contact_resistance():
    # No net current flows in the warp layer by symmetry, so the contacts carry none.
    for rc in (0.0, 0.1, 10.0, 1000.0):
        assert effective_sheet_resistance(10, 0.0, rc, np.random.default_rng(0)) == pytest.approx(1.0, rel=1e-6)


def test_open_when_every_yarn_segment_broken():
    assert effective_sheet_resistance(8, 1.0, 1.0, np.random.default_rng(0)) == np.inf


def test_hand_case_two_by_two():
    # 2 x 2 fabric; draw order per cell is weft-right (if any) then warp-down (if any):
    # (0,0) weft, warp; (0,1) warp; (1,0) weft. 0.0 < f = 0.5 breaks the segment, 0.9 keeps it.
    # Break only the row-0 weft segment. The warp paths of row 0 each join two nodes at the same bar
    # potential, so they carry nothing; row 1's weft (1 ohm) alone conducts: R_total = 1, and the
    # per-square value is R_total * n / (n - 1) = 2, for any contact resistance.
    class Fixed:
        def __init__(self, vals): self.vals = list(vals)
        def random(self): return self.vals.pop(0)
    for rc in (0.0, 0.5, 20.0):
        r = effective_sheet_resistance(2, 0.5, rc, Fixed([0.0, 0.9, 0.9, 0.9]))
        assert r == pytest.approx(2.0, rel=1e-6)


@pytest.mark.parametrize("f", [0.1, 0.3])
def test_resistance_rises_with_contact_resistance(f):
    rs = [np.median(sample(14, f, rc, 8, 3)) for rc in (0.0, 1.0, 10.0, 100.0)]
    assert all(x <= y + 1e-9 for x, y in zip(rs, rs[1:]))


def test_large_rc_approaches_weft_only():
    # With huge contact resistance the warp layer is cut off: a row conducts only if intact.
    n = 10
    r_big = sample(n, 0.05, 1e6, 6, 1)
    r_zero = sample(n, 0.05, 0.0, 6, 1)
    assert np.all(r_big >= r_zero - 1e-9)


def test_se_sheet_matches_textbook():
    assert se_sheet(Z0 / 2) == pytest.approx(20 * np.log10(2))
