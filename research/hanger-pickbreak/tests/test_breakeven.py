import sys
import unittest
from dataclasses import replace
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from hanger_pickbreak.breakeven import Params, breakeven_look, mean_ci, per_pile  # noqa: E402


class Breakeven(unittest.TestCase):
    def test_mean_ci_brackets_mean_and_is_deterministic(self):
        xs = [1.0, 2.0, 3.0, 4.0, 10.0]
        m, lo, hi = mean_ci(xs)
        self.assertEqual(m, 4.0)
        self.assertLessEqual(lo, m)
        self.assertGreaterEqual(hi, m)
        self.assertEqual(mean_ci(xs), (m, lo, hi))

    def test_see_time_is_linear_in_look_time(self):
        a = per_pile(10, "see", replace(Params(), t_see=0.0), 20)
        b = per_pile(10, "see", replace(Params(), t_see=3.0), 20)
        for x, y in zip(a, b):
            self.assertAlmostEqual(y - x, 3.0, places=9)

    def test_breakeven_is_zero_when_every_opening_is_hidden(self):
        (t, lo, hi), gaps = breakeven_look(10, replace(Params(), p_hidden=1.0), 20)
        self.assertEqual((t, lo, hi), (0.0, 0.0, 0.0))
        self.assertTrue(all(g == 0 for g in gaps))

    def test_breakeven_positive_by_default_and_matches_pinch_minus_see(self):
        (t, _, _), gaps = breakeven_look(10, Params(), 30)
        self.assertGreater(t, 0)
        self.assertAlmostEqual(t, sum(gaps) / len(gaps))

    def test_breakeven_grows_with_regrasp_time(self):
        lo = breakeven_look(10, replace(Params(), t_regrasp=3.0), 30)[0][0]
        hi = breakeven_look(10, replace(Params(), t_regrasp=9.0), 30)[0][0]
        self.assertGreater(hi, lo)


if __name__ == "__main__":
    unittest.main()
