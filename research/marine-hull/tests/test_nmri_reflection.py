"""Milestone 7zj: NMRI reflection term (ISO 15016 / ITTC 7.5-04-01-01.1 form), and the pinned hold-out results."""
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

from marine_hull import reflection as rf  # noqa: E402
from marine_hull import waves as wv  # noqa: E402

RESULTS = os.path.join(HERE, "..", "experiments", "results_nmri_reflection.txt")


class NmriTests(unittest.TestCase):
    def test_cu_line_and_floor(self):
        self.assertAlmostEqual(rf.nmri_cu(0.0), 68.0)
        self.assertAlmostEqual(rf.nmri_cu(0.1), 37.0)
        self.assertAlmostEqual(rf.nmri_cu(0.5), 10.0)   # floor

    def test_no_speed_equals_faltinsen_at_same_draft_argument(self):
        w, i, t = 6.0, 0.02, 0.15
        a = rf.nmri_rao(w, 1.0, i, 0.3, t, 2.0, speed=False)
        b = rf.rao(w, 1.0, i, t, draft_arg=1.5, speed=False)
        self.assertAlmostEqual(a / b, 1.0, places=12)

    def test_speed_factor_is_one_plus_cu_froude(self):
        w, i, beam, t, length, u = 6.0, 0.02, 0.3, 0.15, 2.0, 0.886
        a = rf.nmri_rao(w, u, i, beam, t, length)
        b = rf.nmri_rao(w, u, i, beam, t, length, speed=False)
        fn = u / (9.81 * length) ** 0.5
        self.assertAlmostEqual(a / b, 1.0 + rf.nmri_cu(i / beam) * fn, places=9)

    def test_cu_override(self):
        a = rf.nmri_rao(6.0, 1.0, 0.02, 0.3, 0.15, 2.0, cu=10.0)
        b = rf.nmri_rao(6.0, 1.0, 0.02, 0.3, 0.15, 2.0, speed=False)
        self.assertAlmostEqual(a / b, 1.0 + 10.0 / (9.81 * 2.0) ** 0.5, places=9)
        self.assertGreater(wv.reflection_ratio(1.0), 0.0)


class ResultsTests(unittest.TestCase):
    def test_pinned_results(self):
        txt = open(RESULTS).read()
        self.assertIn("B_f 0.0517, C_U 51.97, speed factor 1 + C_U Fn = 11.39", txt)
        self.assertIn("row NMRI_1.5kT 1.124 2.007 1.528", txt)
        self.assertIn("row NMRI_CU=10 0.962 0.726 1.295", txt)
        self.assertIn("row NMRI_1.5kT 2.844 0.321 -3.73 -13.41 True", txt)
        self.assertIn("N6 200 W scope holds in every row: True", txt)


if __name__ == "__main__":
    unittest.main()
