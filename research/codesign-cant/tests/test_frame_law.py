"""Milestone 7p: the frame-mass hook in aero.size and the frame data it was fitted to."""
import csv
import os
import sys

import numpy as np

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from codesign_cant import aero  # noqa: E402


def test_default_frame_law_is_the_inherited_one():
    assert (aero.FRAME0, aero.FRAME_K) == (0.05, 0.8)
    assert np.isclose(aero.frame_mass(0.1), 0.13)


def test_changing_the_frame_law_changes_mass_and_restores():
    base = aero.size(0.11, 0.12)["mass"]
    try:
        aero.FRAME0, aero.FRAME_K = 0.05 + 0.8 * 0.11 - 0.51 * 0.11, 0.51   # anchored at L = 0.11: same frame mass there
        assert np.isclose(aero.size(0.11, 0.12)["mass"], base)
        lo = aero.size(0.13, 0.12)["mass"]
    finally:
        aero.FRAME0, aero.FRAME_K = 0.05, 0.8
    assert lo < aero.size(0.13, 0.12)["mass"]   # a shallower slope makes the longer arm lighter


def test_frame_rows_are_complete_and_sourced():
    rows = list(csv.DictReader(open(os.path.join(HERE, "..", "data", "frames", "frames_hobbyrc.csv"))))
    assert len(rows) >= 30
    for r in rows:
        assert r["url"].startswith("https://") and r["quote"]
        assert r["use"] == "fit" or r["use"].startswith("excluded:")
        w, m = float(r["wheelbase_mm"]), float(r["weight_g"])
        assert 100 < w < 500 and 30 < m < 700
        assert r["wheelbase_mm"].split(".")[0] in r["quote"]
