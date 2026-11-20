"""tests/take_straddle_count.py: take bands and the long survey drill file (eval/take-straddle-count-2026-11-20.md)."""
import json
import os
import sys
import unittest
from unittest import mock

HERE = os.path.dirname(__file__)
sys.path.insert(0, HERE)

import take_straddle_count as tsc  # noqa: E402


def test_bands():
    assert tsc.band(0.0) == "instant"
    assert tsc.band(1.3) == tsc.band(2.0) == "1.3-2.1 ms"
    assert tsc.band(2.4) == tsc.band(2.8) == "2.4-2.8 ms"
    assert tsc.band(0.5) is None and tsc.band(5.0) is None


def test_long_survey_drill_is_the_calibration_drill_twice():
    def load(name):
        with open(os.path.join(HERE, "..", name)) as f:
            return json.load(f)
    cal, long = load("drill.calibration.json"), load("drill.survey-long.json")
    assert long["calibration"] is True
    assert long["shots"] == cal["shots"] * 2
    assert {k: v for k, v in long.items() if k != "shots"} == {k: v for k, v in cal.items() if k != "shots"}



class SummaryMarginTest(unittest.TestCase):
    """A group's @N margin reaches the 1.5 ms vote, and spread takes are counted per take (2026-11-20)."""

    def test_summary_passes_the_group_margin_and_counts_by_take(self):
        import take_straddle_scaled as tss
        seen = []

        def fake(sv, rule, k):
            seen.append((rule, k))
            return sv["v"]
        rows = [(1.3, {"v": 1.5}), (1.3, {"v": None}), (2.0, {"v": 2.5}), (0.0, {"v": 1.5}), (0.0, {"v": 0.0})]
        with mock.patch.object(tss, "verdict", fake):
            s = tsc.summary(rows, [46] * len(rows), margin=3)
        self.assertEqual(set(seen), {("margin", 3)})
        self.assertEqual(s["1.3-2.1 ms"]["named"], 2)
        self.assertEqual(s["1.3-2.1 ms"]["by_take"], {1.3: [1, 2], 2.0: [1, 1]})
        self.assertEqual((s["instant"]["bad"], s["instant"]["by_take"]), (1, {}))

    def test_long_margin_label_reaches_the_2_5_ms_vote_and_is_restored(self):
        import take_straddle_scaled as tss
        from tennisbots import host
        seen = []

        def fake(sv, rule, k):
            seen.append(host.TAKE_STRADDLE_LONG_MARGIN)
            return None
        before = host.TAKE_STRADDLE_LONG_MARGIN
        self.assertEqual(tsc.parse_label("fast@2/3"), ("fast", 2, 3))
        self.assertEqual(tsc.parse_label("fast@3"), ("fast", 3, None))
        self.assertEqual(tsc.parse_label("long"), ("long", 2, None))
        with mock.patch.object(tss, "verdict", fake):
            tsc.summary([(0.0, {"v": 1})], [46], margin=2, long_margin=3)
        self.assertEqual(seen, [3])
        self.assertEqual(host.TAKE_STRADDLE_LONG_MARGIN, before)


if __name__ == "__main__":
    unittest.main()
