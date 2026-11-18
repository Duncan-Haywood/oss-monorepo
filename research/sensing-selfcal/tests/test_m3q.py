"""Milestone 3q: references, bootstrap and the held-out k1 correction (experiments/m3q_residual)."""
import importlib.util
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
_s = importlib.util.spec_from_file_location(
    "m3q_an", os.path.join(HERE, "..", "experiments", "m3q_residual", "analyse.py"))
an = importlib.util.module_from_spec(_s)
_s.loader.exec_module(an)


def test_references_are_the_logged_values():
    assert abs(an.REFS["board"]["fr1"] - 518.28) < 0.01 and abs(an.REFS["board"]["fr3"] - 530.71) < 0.01
    assert an.REFS["tum"] == {"fr1": 516.9, "fr3": 537.3}
    assert abs(an.REFS["tf"]["fr1"] - 525.16) < 0.01 and abs(an.REFS["tf"]["fr3"] - 534.04) < 0.01


def test_ols_recovers_a_line_and_bootstrap_brackets_the_median():
    x = np.linspace(-1, 1, 21)
    a, b = an.ols(x, 0.3 + 2.0 * x)
    assert abs(a - 0.3) < 1e-12 and abs(b - 2.0) < 1e-12
    lo, hi = an.boot_median(np.arange(101.0))
    assert lo < 50 < hi


def test_counted_rows_are_milestone_3p_s_53():
    R = an.rows()
    assert len(R) == 53
    assert sum(r["seq"] == "fr3_stf" for r in R) == 23
