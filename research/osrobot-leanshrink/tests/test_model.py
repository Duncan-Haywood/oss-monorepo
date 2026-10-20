import unittest
from osrobot_leanshrink.model import *


class T(unittest.TestCase):
    def test_zero_shrink_is_constant_offset(self):
        d = Design("none", 0.2)
        self.assertEqual(run_trial(d, 0.03, 3, 0.1, 0.0, 0.02), run_trial(d, 0.03, 3, 0.1, 0.0, 0.02, 0.0))

    def test_shrink_irrelevant_without_bias(self):
        d = Design("none", 0.2)
        self.assertEqual(run_trial(d, 0.03, 5, 0.1, 0.0, 0.0, 0.0), run_trial(d, 0.03, 5, 0.1, 0.0, 0.0, 1.0))

    def test_shrinking_error_helps_blind_arm_feed(self):
        d = Design("none", 0.2)
        ok = lambda k: sum(run_trial(d, 0.03, s, 0.1, 0.0, 0.04, k)["entered"] for s in range(60))
        self.assertGreater(ok(1.0), ok(0.0))

    def test_deterministic(self):
        d = Design("camera", 0.2)
        self.assertEqual(run_trial(d, 0.03, 7, 0.1, 0.0, 0.02, 0.5), run_trial(d, 0.03, 7, 0.1, 0.0, 0.02, 0.5))


if __name__ == "__main__":
    unittest.main()
