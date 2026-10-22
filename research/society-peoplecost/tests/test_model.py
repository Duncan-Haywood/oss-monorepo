import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from society_peoplecost import breakeven_lambda, people_cost, planner_gain, reader, yield_all  # noqa: E402


class Model(unittest.TestCase):
    def test_plain_average_matches_cheapcue_people_mix(self):
        s = reader(0.3, 0.15, 0.6)
        want = 0.2 * s["cU"] + 0.8 * s["cN"]
        self.assertAlmostEqual(people_cost(s), want, places=9)

    def test_crowd_with_robots_recoverable(self):
        s = reader(0.3, 0.15, 0.6)
        self.assertAlmostEqual(s["crowd"], 0.7 * people_cost(s) + 0.3 * s["cR"], places=9)

    def test_gain_rises_with_urgent_weight(self):
        g = [planner_gain(0.3, 0.25, 0.6, lam) for lam in (1, 2, 4, 8)]
        self.assertTrue(all(a < b for a, b in zip(g, g[1:])))

    def test_equal_cost_cue_never_helps_people(self):
        self.assertIsNone(breakeven_lambda(0.3, 1.0, 0.6))

    def test_breakeven_is_zero_of_gain(self):
        b = breakeven_lambda(0.3, 0.25, 0.6)
        self.assertAlmostEqual(planner_gain(0.3, 0.25, 0.6, b), 0.0, places=6)

    def test_free_cue_helps_people_even_unweighted(self):
        self.assertGreater(planner_gain(0.3, 0.0, 0.6), 0.0)


if __name__ == "__main__":
    unittest.main()
