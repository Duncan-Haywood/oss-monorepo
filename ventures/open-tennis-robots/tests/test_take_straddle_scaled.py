"""tests/take_straddle_scaled.py: the binomial straddle rule matches margin 2 up to six straddling wheels
(eval/take-straddle-scaled-2026-11-19.md)."""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

import take_straddle_scaled as tss  # noqa: E402


def test_tail_values():
    assert math.isclose(tss.tail(2, 2), 0.04)
    assert math.isclose(tss.tail(2, 3), 0.104)
    assert math.isclose(tss.tail(0, 5), 1.0)
    assert abs(tss.tail(4, 7) - 0.0333) < 1e-4


def test_binom_05_is_margin_2_below_seven():
    for n in range(0, 7):
        for f in range(n + 1):
            assert tss.fires("binom", 0.05, f, n - f) == tss.fires("margin", 2, f, n - f), (f, n - f)


def test_first_difference_is_four_three():
    assert tss.fires("binom", 0.05, 4, 3) and not tss.fires("margin", 2, 4, 3)
    assert tss.fires("either", 0.05, 4, 3)
