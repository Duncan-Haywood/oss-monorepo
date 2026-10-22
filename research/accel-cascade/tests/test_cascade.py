import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from accel_cascade import cascade  # noqa: E402


class T(unittest.TestCase):
    def setUp(self):
        self.y = np.array([0, 1, 2, 0])
        # small model: confident-right, unsure-wrong, confident-wrong, unsure-right
        self.l1 = np.array([[9, 0, 0], [3, 2, 0], [9, 0, 0], [4, 3, 0]])
        self.l2 = np.eye(3, dtype=int)[self.y] * 10

    def test_margin(self):
        self.assertEqual(cascade.margin(self.l1).tolist(), [9, 1, 9, 1])

    def test_never_and_always_escalate(self):
        f, a = cascade.run(self.l1, self.l2, self.y, 0)
        self.assertEqual((f, a), (0.0, 0.5))          # = small model alone
        f, a = cascade.run(self.l1, self.l2, self.y, 10**6)
        self.assertEqual((f, a), (1.0, 1.0))          # = big model alone

    def test_partial(self):
        f, a = cascade.run(self.l1, self.l2, self.y, 5)
        self.assertEqual(f, 0.5)                      # the two unsure clips escalate
        self.assertEqual(a, 0.5 + 0.25)               # fixes the unsure-wrong one; the confident-wrong stays wrong

    def test_energy(self):
        self.assertAlmostEqual(cascade.energy(2.0, 10.0, 0.25), 4.5)

    def test_pareto(self):
        pts = [(1, 0.5), (2, 0.5), (2, 0.7), (3, 0.6)]
        self.assertEqual(cascade.pareto(pts), [0, 2])

    def test_thresholds_bracket(self):
        m = np.arange(100)
        t = cascade.thresholds(m)
        self.assertEqual(t[0], 0)
        self.assertGreater(t[-1], 99)


if __name__ == "__main__":
    unittest.main()
