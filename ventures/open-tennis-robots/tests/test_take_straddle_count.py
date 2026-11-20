"""tests/take_straddle_count.py: take bands and the long survey drill file (eval/take-straddle-count-2026-11-20.md)."""
import json
import os
import sys

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
