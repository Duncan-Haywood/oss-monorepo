import numpy as np
import pytest
from garment_flexdamage.model import *


def test_break_probs_keep_mean():
    for orient in ("across", "along"):
        for conc in (1.0, 3.0, 5.0):
            P = break_probs(30, 0.1, conc, 0.2, orient)
            assert P.mean() == pytest.approx(0.1, abs=1e-9)
            assert P.min() >= 0 and P.max() <= 1


def test_conc_one_is_uniform():
    assert np.allclose(break_probs(20, 0.2, 1.0), 0.2)


def test_intact_is_one_for_any_k_rc():
    n = 10
    z = np.zeros((n, n), dtype=bool)
    for rc in (0.0, 5.0, 100.0):
        assert effective_sheet_resistance(n, z, z, rc, k=7.0) == pytest.approx(1.0, rel=1e-6)


def test_open_when_all_broken():
    n = 6
    o = np.ones((n, n), dtype=bool)
    assert effective_sheet_resistance(n, o, o, 1.0) == np.inf


def test_k_has_no_effect_without_breaks_but_raises_resistance_with_them():
    n = 14
    r1 = sample(n, 0.2, 5.0, 8, 4, k=1.0)
    r10 = sample(n, 0.2, 5.0, 8, 4, k=10.0)
    assert np.all(r10 >= r1 - 1e-9) and np.median(r10) > np.median(r1)


def test_k_irrelevant_at_zero_rc():
    r1 = sample(12, 0.2, 0.0, 6, 2, k=1.0)
    r9 = sample(12, 0.2, 0.0, 6, 2, k=9.0)
    assert np.allclose(r1, r9)


def test_hand_case_single_break_two_by_two():
    # Break only row 0's weft segment W(0,0)-W(0,1). Row 1 weft (1 ohm) alone conducts, as in contactres:
    # R_total = 1, per square 2, whatever rc and k.
    wb = np.zeros((2, 2), dtype=bool); vb = wb.copy(); wb[0, 0] = True
    for rc, k in ((0.5, 1.0), (3.0, 10.0)):
        assert effective_sheet_resistance(2, wb, vb, rc, k) == pytest.approx(2.0, rel=1e-6)


def test_fold_across_hurts_more_than_along():
    # Same mean break fraction; a fold band across the current cuts every row, so it should not conduct better.
    a = np.median(sample(20, 0.2, 0.0, 30, 5, conc=4.0, orient="across"))
    b = np.median(sample(20, 0.2, 0.0, 30, 5, conc=4.0, orient="along"))
    assert a >= b


def test_median_ci_brackets_median():
    rng = np.random.default_rng(0)
    m, lo, hi, nopen = median_ci(np.array([1.0, 2.0, 3.0, 4.0, np.inf]), rng)
    assert lo <= m <= hi and nopen == 1
