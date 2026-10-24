import sys
import unittest
from dataclasses import replace
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from hanger_misaim.misaim import Params, blind, breakeven_error, breakeven_look, per_pile, unload  # noqa: E402

P = Params()


class T(unittest.TestCase):
    def test_zero_error_equals_see(self):
        for s in range(10):
            from hanger_misaim.misaim import unload_err
            self.assertAlmostEqual(unload_err(12, P, 0.0, s), unload(12, "see", P, s)["per_item"], 12)

    def test_error_costs_time(self):
        a = sum(per_pile(12, P, 0.0, 40))
        b = sum(per_pile(12, P, 0.5, 40))
        c = sum(per_pile(12, P, 1.0, 40))
        self.assertLess(a, b)
        self.assertLess(b, c)

    def test_breakeven_look_falls_with_error(self):
        t0 = breakeven_look(12, P, 0.0, 60)[0]
        t5 = breakeven_look(12, P, 0.5, 60)[0]
        self.assertGreater(t0, t5)

    def test_breakeven_error_in_range(self):
        e = breakeven_error(12, P, 60, iters=6)
        self.assertTrue(0.0 <= e <= 1.0)

    def test_slow_detector_never_wins(self):
        self.assertIsNone(breakeven_error(12, replace(P, t_see=60.0), 30, iters=4))


if __name__ == "__main__":
    unittest.main()
