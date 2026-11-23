"""Milestone 91 (experiments/arbiter_threshold): zoned float32 arbiter threshold rules and worst-zone conviction."""
import importlib.util
import os

import pytest

np = pytest.importorskip("numpy")
EXP = os.path.join(os.path.dirname(__file__), "..", "experiments", "arbiter_threshold")
_spec = importlib.util.spec_from_file_location("at_analyze", os.path.join(EXP, "analyze.py"))
A = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(A)


def test_rule_family_is_the_preregistered_one():
    names = [r[0] for r in A.rules()]
    assert len(names) == 2 * (4 + 21 + 5) and "MAX(10,C40)" in names and "Q(0.95,20,C80)" in names
    assert "LOG(8,C40)" in names


def test_one_outlier_sets_the_max_rule_but_not_the_quantile_rule():
    cal = np.full((40, 10), 1e-5)
    cal[3, 2] = 1e-2  # one large honest value in zone 0
    mx = A.threshold(cal, "max", None, 10)
    q = A.threshold(cal, "q", 0.95, 10)
    assert mx[0] == pytest.approx(0.1) and mx[7] == pytest.approx(1e-4)
    assert q[0] == pytest.approx(1e-4)  # the quantile ignores the single outlier
    lg = A.threshold(cal, "log", None, 8)
    assert lg[0] == pytest.approx(1e-5)  # MAD of a constant zone is 0


def test_worst_zone():
    conv = np.zeros((4, 10), dtype=bool)
    conv[:, 5:] = True
    mean, worst, wz, z = A.conv_stats(conv)
    assert mean == 0.5 and worst == 0.0 and wz == 0 and list(z) == [0.0, 1.0]
