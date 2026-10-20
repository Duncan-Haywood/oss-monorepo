import unittest
from osrobot_assist.model import *


class T(unittest.TestCase):
    def test_still_mouth_never_touches(self):
        for sense in ("none", "camera"):
            r = summarise(Design(sense, 0.1), 0.0, range(5))
            self.assertEqual(r["touch"], 0.0)
            self.assertEqual(r["success"], 1.0)

    def test_push_force_is_loop_stiffness_times_lead_times_speed(self):
        # a mouth far off line: the tip pushes the lips; the peak is KP*LEAD*v (plus the small impact term)
        d = Design("none", 0.1)
        r = summarise(d, 0.05, range(30))
        self.assertAlmostEqual(r["peak_max"], KP * LEAD * 0.1, delta=0.5)

    def test_force_cap_lowers_peak(self):
        free = summarise(Design("none", 0.3), 0.04, range(30))["peak_max"]
        capped = summarise(Design("none", 0.3, f_cap=1.0), 0.04, range(30))["peak_max"]
        self.assertLess(capped, free)

    def test_deterministic_given_seed(self):
        d = Design("camera", 0.2)
        self.assertEqual(run_trial(d, 0.03, 7), run_trial(d, 0.03, 7))

    def test_camera_touches_less_than_open_loop_with_no_latency(self):
        cam = summarise(Design("camera", 0.1, delay=0.0), 0.03, range(60))["touch"]
        blind = summarise(Design("none", 0.1), 0.03, range(60))["touch"]
        self.assertLess(cam, blind)

    def test_slower_approach_pushes_softer(self):
        slow = summarise(Design("none", 0.03), 0.04, range(30))["peak_max"]
        fast = summarise(Design("none", 0.2), 0.04, range(30))["peak_max"]
        self.assertLess(slow, fast)


if __name__ == "__main__":
    unittest.main()
