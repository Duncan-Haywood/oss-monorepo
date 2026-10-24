import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from eda_systolicclock import clock as C  # noqa: E402

ROWS = [{"kind": "systolic", "c": 4, "wb": 4, "area_um2": 10, "cycles": 10, "delay_ps": 5000},
        {"kind": "lane", "c": 4, "wb": 4, "area_um2": 5, "cycles": 30, "delay_ps": 3000},
        {"kind": "lane", "c": 8, "wb": 4, "area_um2": 20, "cycles": 8, "delay_ps": 3500}]


class Clock(unittest.TestCase):
    def test_best_excludes_designs_missing_target(self):
        self.assertEqual(C.best(ROWS, 4000), 1)        # systolic (100) is too slow; lane c4 150 < lane c8 160
        self.assertEqual(C.best(ROWS, 6000), 0)        # all meet; 100 is smallest
        self.assertIsNone(C.best(ROWS, 2000))

    def test_kind_filter_and_verdict(self):
        self.assertEqual(C.best(ROWS, 6000, "lane"), 1)
        self.assertEqual(C.kind_verdict(ROWS, 4000), "lane")
        self.assertEqual(C.kind_verdict(ROWS, 6000), "systolic")
        self.assertIsNone(C.kind_verdict(ROWS, 100))

    def test_label(self):
        self.assertEqual(C.label(ROWS[0]), "sys4x4w4")
        self.assertEqual(C.label(ROWS[1]), "lane4w4")

    def test_script_reused(self):
        self.assertIn("map -D 4000", C.script(4000))


if __name__ == "__main__":
    unittest.main()
