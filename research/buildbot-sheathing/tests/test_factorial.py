"""Milestone 42: the 2 x 2 split of a change into two factors."""
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from buildbot_sheathing import factorial as F  # noqa: E402


def test_additive_cells_have_no_interaction():
    s = F.split2x2(1.0, 0.7, 0.9, 0.6)
    assert s["a"] == pytest.approx(-0.3) and s["b"] == pytest.approx(-0.1)
    assert s["interaction"] == pytest.approx(0.0)


def test_parts_sum_to_the_whole():
    s = F.split2x2(0.916, 0.903, 0.916, 0.903)
    assert s["both"] == pytest.approx(s["a"] + s["b"] + s["interaction"])
    assert s["b"] == 0.0 and s["interaction"] == pytest.approx(0.0)


def test_pure_interaction():
    s = F.split2x2(0.0, 0.0, 0.0, 1.0)
    assert s["a"] == 0.0 and s["b"] == 0.0 and s["interaction"] == 1.0


def test_missing_cell_raises():
    with pytest.raises(ValueError):
        F.split2x2(1.0, None, 0.9, 0.8)
