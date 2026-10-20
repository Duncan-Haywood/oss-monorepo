import sys, unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "osrobot-assist" / "src"))
from osrobot_mjfeed.model import *
import osrobot_assist.model as st


class T(unittest.TestCase):
    def test_blocked_arm_steady_push_matches_controller_identity(self):
        for v in (0.05, 0.10):
            r = run_trial(Design(sense="none", v_app=v), 0.0, 0, offset=0.03)
            self.assertFalse(r["entered"])
            self.assertAlmostEqual(r["f_tail"], KP * LEAD * v, delta=0.03 * KP * LEAD * v)

    def test_impact_peak_exceeds_steady_push_and_falls_with_damping(self):
        lo = run_trial(Design(sense="none", v_app=0.10), 0.0, 0, offset=0.03, m=build(800, 1))["peak"]
        hi = run_trial(Design(sense="none", v_app=0.10), 0.0, 0, offset=0.03, m=build(800, 64))["peak"]
        self.assertGreater(lo, hi)
        self.assertGreater(hi, 0.9 * KP * LEAD * 0.10)

    def test_aimed_blind_arm_feeds_without_touching_a_still_mouth(self):
        r = run_trial(Design(sense="none", v_app=0.10), 0.0, 0)
        self.assertTrue(r["entered"])
        self.assertEqual(r["contact_s"], 0.0)

    def test_deterministic(self):
        d = Design(sense="camera", v_app=0.10)
        self.assertEqual(run_trial(d, 0.03, 5), run_trial(d, 0.03, 5))

    def test_feeding_time_agrees_with_stylised_twin(self):
        d = dict(sense="camera", v_app=0.10)
        a = summarise(Design(**d), 0.03, range(20))["time_mean"]
        b = st.summarise(st.Design(**d), 0.03, range(20))["time_mean"]
        self.assertAlmostEqual(a, b, delta=0.05 * b)

    def test_zero_latency_camera_touches_less_than_delayed(self):
        fast = summarise(Design(delay=0.0, v_app=0.10), 0.03, range(30))["touch"]
        slow = summarise(Design(delay=0.4, v_app=0.10), 0.03, range(30))["touch"]
        self.assertLess(fast, slow)


if __name__ == "__main__":
    unittest.main()
