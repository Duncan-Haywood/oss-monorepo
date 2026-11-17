import math
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from buildbot_sheathing import ceiling as Q  # noqa: E402


def test_tool_only_matches_closed_form():
    mc = Q.clean(on=("tool",), trials=20000)["clean"]
    assert mc == pytest.approx(Q.tool_only_closed_form(), abs=0.004)


def test_no_sources_is_perfect():
    assert Q.clean(on=(), trials=2000)["clean"] == 1.0


def test_all_sources_reproduces_milestone_9_ceiling():
    # milestone 9, section D: straight studs, three-foot rock, 0.7370
    assert Q.clean(trials=20000)["clean"] == pytest.approx(0.7370, abs=1e-4)


def test_shapley_is_efficient_and_symmetric():
    w = {"a": 1.0, "b": 2.0, "c": 0.5}
    val = lambda s: sum(w[p] for p in s) + (0.3 if {"a", "b"} <= s else 0.0)  # noqa: E731
    phi, _ = Q.shapley(val, "abc")
    assert sum(phi.values()) == pytest.approx(val(frozenset("abc")))
    assert phi["a"] == pytest.approx(1.15) and phi["b"] == pytest.approx(2.15) and phi["c"] == pytest.approx(0.5)


def test_slide_residual():
    assert Q.slide_sx(0.0) == pytest.approx(0.5e-3 / math.sqrt(2))
    assert Q.slide_sx(0.5e-3) == pytest.approx(math.hypot(0.5e-3 / math.sqrt(2), 0.5e-3))
