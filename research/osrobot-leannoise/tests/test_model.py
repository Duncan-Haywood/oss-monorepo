import unittest
from osrobot_leannoise.model import *


class T(unittest.TestCase):
    def test_zero_perception_error_is_plain_lean(self):
        d = Design("none", 0.2)
        a = run_trial(d, 0.03, 3, 0.1)
        self.assertEqual(a, run_trial(d, 0.03, 3, 0.1, 0.0, 0.0))

    def test_zero_lean_ignores_perception(self):
        d = Design("none", 0.1)
        self.assertEqual(run_trial(d, 0.03, 4), run_trial(d, 0.03, 4, 0.0, 0.5, 0.02))

    def test_bias_hurts_blind_arm_feeding(self):
        d = Design("none", 0.2)
        ok = lambda b: sum(run_trial(d, 0.03, s, 0.1, 0.0, b)["entered"] for s in range(60))
        self.assertLess(ok(0.04), ok(0.0))

    def test_deterministic(self):
        d = Design("camera", 0.2)
        self.assertEqual(run_trial(d, 0.03, 7, 0.05, 0.2, 0.01), run_trial(d, 0.03, 7, 0.05, 0.2, 0.01))


if __name__ == "__main__":
    unittest.main()
