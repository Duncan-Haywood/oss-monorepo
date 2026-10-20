import unittest
from osrobot_lean.model import *


class T(unittest.TestCase):
    def test_zero_lean_matches_passive_user(self):
        d = Design("none", 0.1)
        self.assertEqual(run_trial(d, 0.03, 3, 0.0), run_trial(d, 0.03, 3))

    def test_lean_cuts_touch_for_blind_arm(self):
        d = Design("none", 0.1)
        base = sum(run_trial(d, 0.03, s, 0.0)["contact_s"] > 0 for s in range(60))
        lean = sum(run_trial(d, 0.03, s, 0.10)["contact_s"] > 0 for s in range(60))
        self.assertLess(lean, base)

    def test_deterministic(self):
        d = Design("camera", 0.2)
        self.assertEqual(run_trial(d, 0.03, 7, 0.05), run_trial(d, 0.03, 7, 0.05))

    def test_still_mouth_no_touch(self):
        self.assertEqual(run_trial(Design("none", 0.1), 0.0, 1, 0.05)["contact_s"], 0.0)


if __name__ == "__main__":
    unittest.main()
