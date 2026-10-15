import math
import unittest

from verification_markets.scoring_rules import (
    SCORING_RULES,
    brier_score,
    expected_score,
    log_score,
    spherical_score,
)


class TestProperness(unittest.TestCase):
    """Numerically verify each rule is (strictly) proper: expected score is
    maximized by reporting your true belief."""

    def test_all_rules_maximized_at_truth(self):
        grid = [i / 200 for i in range(1, 200)]
        beliefs = [0.05, 0.2, 0.37, 0.5, 0.63, 0.8, 0.95]
        for name, rule in SCORING_RULES.items():
            for belief in beliefs:
                scores = {r: expected_score(rule, r, belief) for r in grid}
                best_report = max(scores, key=scores.get)
                with self.subTest(rule=name, belief=belief):
                    self.assertAlmostEqual(best_report, belief, delta=0.02)

    def test_log_score_values(self):
        self.assertAlmostEqual(log_score(0.5, 1), math.log(0.5))
        self.assertAlmostEqual(log_score(0.5, 0), math.log(0.5))
        self.assertGreater(log_score(0.9, 1), log_score(0.5, 1))

    def test_brier_score_bounds(self):
        self.assertAlmostEqual(brier_score(1.0, 1), 1.0, places=6)
        self.assertAlmostEqual(brier_score(0.0, 1), 0.0, places=6)

    def test_spherical_score_bounds(self):
        s_perfect = spherical_score(1.0, 1)
        s_wrong = spherical_score(1.0, 0)
        self.assertGreater(s_perfect, s_wrong)


if __name__ == "__main__":
    unittest.main()
