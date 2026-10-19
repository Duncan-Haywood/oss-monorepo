import math, pathlib, sys, unittest
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))
from selfrep_platepack.model import DIVISORS, plated, work_hours, simulate


class T(unittest.TestCase):
    def test_k1_no_changeover_matches_partpool(self):
        from selfrep_partpool.model import default_params
        a, b = plated(1, 0.0), default_params(1e9)
        self.assertEqual(a.parts, b.parts)

    def test_plate_count(self):
        for k in DIVISORS:
            self.assertEqual(len(plated(k, 0.5).parts), 44 // k)

    def test_work_without_changeover_is_independent_of_k(self):
        w = {round(work_hours(plated(k, 0.0)), 9) for k in DIVISORS}
        self.assertEqual(len(w), 1)

    def test_changeover_adds_per_plate(self):
        p = plated(4, 0.5)
        self.assertAlmostEqual(work_hours(p) - work_hours(plated(4, 0.0)), 0.5 * 11)

    def test_bad_k(self):
        with self.assertRaises(ValueError):
            plated(3, 0.0)

    def test_deterministic_single_printer_time(self):
        # one printer, no noise: first copy takes all plates + assembly, so fleet 2 at work_hours
        p = plated(11, 0.25, cv=0)
        self.assertAlmostEqual(simulate(p, "whole", 1, 2), work_hours(p))
        self.assertAlmostEqual(simulate(p, "focus", 1, 2), work_hours(p))

    def test_more_plates_never_faster_with_overhead_single_printer(self):
        t = [simulate(plated(k, 0.5, cv=0), "focus", 1, 2) for k in DIVISORS]
        self.assertEqual(t, sorted(t, reverse=True))


if __name__ == "__main__":
    unittest.main()
